package com.pulserealm.client.ui.join

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.ServerDiscoveryClient
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.model.RealmInfo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import com.pulserealm.client.data.network.RealmApi
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

data class JoinUiState(
    val serverUrl: String = "",
    val joinCode: String = "",
    val playerName: String = "",
    val heightCm: String = "",
    val weightKg: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val realmInfo: RealmInfo? = null,
    val isJoined: Boolean = false,
    val clientId: String = "wear-" + java.util.UUID.randomUUID().toString().take(8),
    val showServerConfig: Boolean = true,
    val showProfileSettings: Boolean = false,
    val showManualEntry: Boolean = false,
)

@HiltViewModel
class JoinViewModel @Inject constructor(
    private val signalRClient: SignalRClient,
    private val prefs: SharedPreferences
) : ViewModel() {

    companion object {
        private const val PREF_SERVER_URL = "cached_server_url"
        private const val PREF_PLAYER_NAME = "player_name"
        private const val PREF_HEIGHT_CM = "height_cm"
        private const val PREF_WEIGHT_KG = "weight_kg"
    }

    private val _uiState = MutableStateFlow(JoinUiState())
    val uiState: StateFlow<JoinUiState> = _uiState.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState

    private val discoveryClient = ServerDiscoveryClient()
    val discoveredServers: StateFlow<List<DiscoveredServer>> = discoveryClient.discoveredServers
    val isScanning: StateFlow<Boolean> = discoveryClient.isScanning

    private var _scanAttempt = MutableStateFlow(0)
    val scanAttempt: StateFlow<Int> = _scanAttempt.asStateFlow()

    init {
        // Load saved profile settings
        val savedName = prefs.getString(PREF_PLAYER_NAME, "") ?: ""
        val savedHeight = prefs.getString(PREF_HEIGHT_CM, "") ?: ""
        val savedWeight = prefs.getString(PREF_WEIGHT_KG, "") ?: ""
        _uiState.value = _uiState.value.copy(
            playerName = savedName,
            heightCm = savedHeight,
            weightKg = savedWeight
        )

        // Try cached server URL first, then fall back to UDP scan
        val cachedUrl = prefs.getString(PREF_SERVER_URL, null)
        if (cachedUrl != null) {
            _uiState.value = _uiState.value.copy(serverUrl = cachedUrl)
            verifyCachedServer(cachedUrl)
        } else {
            scanForServers()
        }
    }

    /**
     * Quickly probe the cached server URL via /api/discovery.
     * If reachable, skip straight to the join code screen.
     * If not, fall back to UDP broadcast scan.
     */
    private fun verifyCachedServer(url: String) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val conn = URL("${url.trimEnd('/')}/api/discovery").openConnection() as HttpURLConnection
                conn.connectTimeout = 3000
                conn.readTimeout = 3000
                conn.requestMethod = "GET"

                if (conn.responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    conn.disconnect()
                    if (body.contains("PulseRealm")) {
                        // Cached server is still reachable — skip to join code
                        _uiState.value = _uiState.value.copy(
                            serverUrl = url,
                            showServerConfig = false,
                            errorMessage = null
                        )
                        return@launch
                    }
                }
                conn.disconnect()
            } catch (_: Exception) {
                // Probe failed
            }

            // Cached URL unreachable — fall back to scan
            scanForServers()
        }
    }

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
        saveServerUrl(url)
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            showServerConfig = false,
            errorMessage = null
        )
    }

    fun selectDiscoveredServer(server: DiscoveredServer) {
        val url = discoveryClient.buildServerUrl(server)
        saveServerUrl(url)
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            showServerConfig = false,
            errorMessage = null
        )
    }

    fun changeServer() {
        _uiState.value = _uiState.value.copy(showServerConfig = true, errorMessage = null)
    }

    fun toggleProfileSettings() {
        _uiState.value = _uiState.value.copy(showProfileSettings = !_uiState.value.showProfileSettings)
    }

    fun toggleManualEntry() {
        val show = !_uiState.value.showManualEntry
        _uiState.value = _uiState.value.copy(
            showManualEntry = show,
            serverUrl = if (show && _uiState.value.serverUrl.isBlank()) "http://" else _uiState.value.serverUrl
        )
    }

    fun updatePlayerName(name: String) {
        _uiState.value = _uiState.value.copy(playerName = name)
        prefs.edit().putString(PREF_PLAYER_NAME, name).apply()
    }

    fun updateHeightCm(height: String) {
        val filtered = height.filter { it.isDigit() || it == '.' }
        _uiState.value = _uiState.value.copy(heightCm = filtered)
        prefs.edit().putString(PREF_HEIGHT_CM, filtered).apply()
    }

    fun updateWeightKg(weight: String) {
        val filtered = weight.filter { it.isDigit() || it == '.' }
        _uiState.value = _uiState.value.copy(weightKg = filtered)
        prefs.edit().putString(PREF_WEIGHT_KG, filtered).apply()
    }

    fun scanForServers() {
        _scanAttempt.value++
        viewModelScope.launch {
            discoveryClient.scan()
        }
    }

    private fun saveServerUrl(url: String) {
        prefs.edit().putString(PREF_SERVER_URL, url).apply()
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

                // 2. Join realm via SignalR with profile data
                signalRClient.joinRealm(
                    state.joinCode,
                    state.clientId,
                    state.playerName,
                    state.heightCm.toDoubleOrNull() ?: 0.0,
                    state.weightKg.toDoubleOrNull() ?: 0.0
                )

                // Check for errors from the hub
                val hubError = signalRClient.error.value
                if (hubError != null) {
                    signalRClient.disconnect()
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = hubError)
                    return@launch
                }

                // 3. Fetch realm info via REST to get the realmId
                val retrofit = Retrofit.Builder()
                    .baseUrl(state.serverUrl.trimEnd('/') + "/")
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()

                val api = retrofit.create(RealmApi::class.java)
                val realmInfo = api.getRealm(state.joinCode)

                // Cache the server URL on successful join
                saveServerUrl(state.serverUrl)

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    realmInfo = realmInfo,
                    isJoined = true
                )
            } catch (e: Exception) {
                signalRClient.disconnect()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Failed to join realm"
                )
            }
        }
    }

    fun disconnect() {
        signalRClient.disconnect()
        _uiState.value = _uiState.value.copy(
            isJoined = false,
            realmInfo = null
        )
    }
}
