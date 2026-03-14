package com.pulserealm.client.ui.join

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.ServerDiscoveryClient
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
    val serverUrl: String = "",
    val joinCode: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val sessionInfo: SessionInfo? = null,
    val isJoined: Boolean = false,
    val clientId: String = "wear-" + java.util.UUID.randomUUID().toString().take(8),
    val showServerConfig: Boolean = true,
)

@HiltViewModel
class JoinViewModel @Inject constructor(
    private val signalRClient: SignalRClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(JoinUiState())
    val uiState: StateFlow<JoinUiState> = _uiState.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState

    private val discoveryClient = ServerDiscoveryClient()
    val discoveredServers: StateFlow<List<DiscoveredServer>> = discoveryClient.discoveredServers
    val isScanning: StateFlow<Boolean> = discoveryClient.isScanning

    fun updateServerUrl(url: String) {
        _uiState.value = _uiState.value.copy(serverUrl = url)
    }

    fun updateJoinCode(code: String) {
        _uiState.value = _uiState.value.copy(
            joinCode = code.filter { it.isDigit() }.take(6),
            errorMessage = null
        )
    }

    fun confirmServer() {
        val url = _uiState.value.serverUrl.trimEnd('/')
        if (url.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Enter a server address")
            return
        }
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            showServerConfig = false,
            errorMessage = null
        )
    }

    fun selectDiscoveredServer(server: DiscoveredServer) {
        val url = discoveryClient.buildServerUrl(server)
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            showServerConfig = false,
            errorMessage = null
        )
    }

    fun changeServer() {
        _uiState.value = _uiState.value.copy(showServerConfig = true, errorMessage = null)
    }

    fun scanForServers() {
        viewModelScope.launch {
            discoveryClient.scan()
        }
    }

    fun join() {
        val state = _uiState.value
        if (state.joinCode.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Enter a join code")
            return
        }
        if (state.serverUrl.isBlank()) {
            _uiState.value = state.copy(errorMessage = "Set a server address first", showServerConfig = true)
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
