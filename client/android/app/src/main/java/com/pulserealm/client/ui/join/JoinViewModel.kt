package com.pulserealm.client.ui.join

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.model.SessionInfo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import com.pulserealm.client.data.network.SessionApi
import javax.inject.Inject

data class JoinUiState(
    val serverUrl: String = "http://10.0.2.2:5062",
    val joinCode: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val sessionInfo: SessionInfo? = null,
    val isJoined: Boolean = false,
    val clientId: String = "wear-" + java.util.UUID.randomUUID().toString().take(8)
)

@HiltViewModel
class JoinViewModel @Inject constructor(
    private val signalRClient: SignalRClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(JoinUiState())
    val uiState: StateFlow<JoinUiState> = _uiState.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState

    fun updateServerUrl(url: String) {
        _uiState.value = _uiState.value.copy(serverUrl = url)
    }

    fun updateJoinCode(code: String) {
        _uiState.value = _uiState.value.copy(
            joinCode = code.uppercase().take(6),
            errorMessage = null
        )
    }

    fun join() {
        val state = _uiState.value
        if (state.joinCode.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Enter a join code")
            return
        }

        _uiState.value = state.copy(isLoading = true, errorMessage = null)

        viewModelScope.launch(Dispatchers.IO) {
            try {
                // 1. Connect to SignalR hub
                signalRClient.connect(state.serverUrl)

                if (signalRClient.connectionState.value != ConnectionState.CONNECTED) {
                    val err = signalRClient.error.value ?: "Connection failed"
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = err)
                    return@launch
                }

                // 2. Join session via SignalR
                signalRClient.joinSession(state.joinCode, state.clientId)

                // Check for errors from the hub
                val hubError = signalRClient.error.value
                if (hubError != null) {
                    signalRClient.disconnect()
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = hubError)
                    return@launch
                }

                // 3. Fetch session info via REST to get the sessionId
                val retrofit = Retrofit.Builder()
                    .baseUrl(state.serverUrl.trimEnd('/') + "/")
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()

                val api = retrofit.create(SessionApi::class.java)
                val sessionInfo = api.getSession(state.joinCode)

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    sessionInfo = sessionInfo,
                    isJoined = true
                )
            } catch (e: Exception) {
                signalRClient.disconnect()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Failed to join session"
                )
            }
        }
    }

    fun disconnect() {
        signalRClient.disconnect()
        _uiState.value = _uiState.value.copy(
            isJoined = false,
            sessionInfo = null
        )
    }
}
