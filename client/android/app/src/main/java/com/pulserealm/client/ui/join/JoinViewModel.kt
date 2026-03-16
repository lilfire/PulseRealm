package com.pulserealm.client.ui.join

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.ServerDiscoveryClient
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.model.RealmInfo
import com.pulserealm.client.data.network.RealmApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

enum class ConnectionMode { LOCAL, REMOTE }

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
    val clientId: String = "",
    val showServerConfig: Boolean = true,
    val showProfileSettings: Boolean = false,
    val showManualEntry: Boolean = false,
    val connectionMode: ConnectionMode = ConnectionMode.LOCAL,
    val remoteUrl: String = "",
    val isVerifyingServer: Boolean = false,
)

@HiltViewModel
class JoinViewModel @Inject constructor(
    private val signalRClient: SignalRClient,
    private val prefs: SharedPreferences,
    private val discoveryClient: ServerDiscoveryClient
) : ViewModel() {

    companion object {
        private const val PREF_SERVER_URL = "cached_server_url"
        private const val PREF_PLAYER_NAME = "player_name"
        private const val PREF_HEIGHT_CM = "height_cm"
        private const val PREF_WEIGHT_KG = "weight_kg"
        private const val PREF_CONNECTION_MODE = "connection_mode"
        private const val PREF_REMOTE_URL = "remote_server_url"
        private const val PREF_CLIENT_ID = "client_id"
    }

    private val _uiState = MutableStateFlow(JoinUiState())
    val uiState: StateFlow<JoinUiState> = _uiState.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState

    val discoveredServers: StateFlow<List<DiscoveredServer>> = discoveryClient.discoveredServers
    val isScanning: StateFlow<Boolean> = discoveryClient.isScanning

    private var _scanAttempt = MutableStateFlow(0)
    val scanAttempt: StateFlow<Int> = _scanAttempt.asStateFlow()

    // Cached Retrofit instance, rebuilt only when base URL changes
    private var cachedRetrofit: Retrofit? = null
    private var cachedRetrofitBaseUrl: String? = null

    // Overridable for testing
    internal var realmApiFactory: (String) -> RealmApi = ::getRealmApi

    init {
        // Load or generate a stable client ID
        val clientId = prefs.getString(PREF_CLIENT_ID, null) ?: run {
            val id = "wear-" + java.util.UUID.randomUUID().toString().take(8)
            prefs.edit().putString(PREF_CLIENT_ID, id).apply()
            id
        }

        // Load saved profile settings
        val savedName = prefs.getString(PREF_PLAYER_NAME, "") ?: ""
        val savedHeight = prefs.getString(PREF_HEIGHT_CM, "") ?: ""
        val savedWeight = prefs.getString(PREF_WEIGHT_KG, "") ?: ""
        val savedMode = when (prefs.getString(PREF_CONNECTION_MODE, "local")) {
            "remote" -> ConnectionMode.REMOTE
            else -> ConnectionMode.LOCAL
        }
        val savedRemoteUrl = prefs.getString(PREF_REMOTE_URL, "") ?: ""

        _uiState.value = _uiState.value.copy(
            clientId = clientId,
            playerName = savedName,
            heightCm = savedHeight,
            weightKg = savedWeight,
            connectionMode = savedMode,
            remoteUrl = savedRemoteUrl
        )

        if (savedMode == ConnectionMode.REMOTE && savedRemoteUrl.isNotBlank()) {
            // Remote mode — try saved remote URL directly
            _uiState.value = _uiState.value.copy(
                serverUrl = savedRemoteUrl,
                showManualEntry = true,
                isVerifyingServer = true
            )
            verifyCachedServer(savedRemoteUrl)
        } else {
            // Local mode — try cached URL first, then fall back to UDP scan
            val cachedUrl = prefs.getString(PREF_SERVER_URL, null)
            if (cachedUrl != null) {
                _uiState.value = _uiState.value.copy(
                    serverUrl = cachedUrl,
                    isVerifyingServer = true
                )
                verifyCachedServer(cachedUrl)
            } else {
                scanForServers()
            }
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
                            isVerifyingServer = false,
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
            _uiState.value = _uiState.value.copy(isVerifyingServer = false)
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

    private fun ensureScheme(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isBlank()) return trimmed
        return if (trimmed.startsWith("http://", ignoreCase = true) || trimmed.startsWith("https://", ignoreCase = true))
            trimmed
        else
            "http://$trimmed"
    }

    fun confirmServer() {
        val url = ensureScheme(_uiState.value.serverUrl)
        if (url.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Enter a server address")
            return
        }
        _uiState.value = _uiState.value.copy(
            serverUrl = url,
            isLoading = true,
            errorMessage = null
        )
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val conn = URL("${url.trimEnd('/')}/api/discovery").openConnection() as HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.requestMethod = "GET"

                if (conn.responseCode == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    conn.disconnect()
                    if (body.contains("PulseRealm")) {
                        saveServerUrl(url)
                        _uiState.value = _uiState.value.copy(
                            serverUrl = url,
                            showServerConfig = false,
                            isLoading = false,
                            errorMessage = null
                        )
                        return@launch
                    }
                }
                conn.disconnect()
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "Not a PulseRealm server"
                )
            } catch (_: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "Could not reach server"
                )
            }
        }
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

    fun setConnectionMode(mode: ConnectionMode) {
        _uiState.value = _uiState.value.copy(connectionMode = mode)
        prefs.edit().putString(PREF_CONNECTION_MODE, if (mode == ConnectionMode.REMOTE) "remote" else "local").apply()

        if (mode == ConnectionMode.LOCAL) {
            _uiState.value = _uiState.value.copy(showManualEntry = false, errorMessage = null)
            scanForServers()
        } else {
            _uiState.value = _uiState.value.copy(
                showManualEntry = true,
                errorMessage = null,
                serverUrl = _uiState.value.remoteUrl.ifBlank { "" }
            )
        }
    }

    fun updateRemoteUrl(url: String) {
        val normalized = ensureScheme(url)
        _uiState.value = _uiState.value.copy(remoteUrl = normalized, serverUrl = normalized)
        prefs.edit().putString(PREF_REMOTE_URL, normalized).apply()
    }

    fun toggleManualEntry() {
        val show = !_uiState.value.showManualEntry
        _uiState.value = _uiState.value.copy(
            showManualEntry = show,
            serverUrl = _uiState.value.serverUrl
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

    private fun getRealmApi(baseUrl: String): RealmApi {
        val normalizedBase = baseUrl.trimEnd('/') + "/"
        if (cachedRetrofit == null || cachedRetrofitBaseUrl != normalizedBase) {
            cachedRetrofit = Retrofit.Builder()
                .baseUrl(normalizedBase)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
            cachedRetrofitBaseUrl = normalizedBase
        }
        return cachedRetrofit!!.create(RealmApi::class.java)
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

                // 2. Clear stale errors before joining
                signalRClient.clearError()

                // 3. Join realm via SignalR with profile data
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

                // 4. Fetch realm info via REST to get the realmId
                val api = realmApiFactory(state.serverUrl)
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
