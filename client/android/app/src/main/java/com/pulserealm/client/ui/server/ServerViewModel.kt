package com.pulserealm.client.ui.server

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.ServerDiscoveryClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject

enum class ConnectionMode { LOCAL, REMOTE }

data class ServerUiState(
    val serverUrl: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val showManualEntry: Boolean = false,
    val connectionMode: ConnectionMode = ConnectionMode.LOCAL,
    val remoteUrl: String = "",
    val isVerifyingServer: Boolean = false,
    val isConnected: Boolean = false,
)

@HiltViewModel
class ServerViewModel @Inject constructor(
    private val prefs: SharedPreferences,
    private val discoveryClient: ServerDiscoveryClient
) : ViewModel() {

    companion object {
        private const val PREF_SERVER_URL = "cached_server_url"
        private const val PREF_CONNECTION_MODE = "connection_mode"
        private const val PREF_REMOTE_URL = "remote_server_url"
    }

    private val _uiState = MutableStateFlow(ServerUiState())
    val uiState: StateFlow<ServerUiState> = _uiState.asStateFlow()

    val discoveredServers: StateFlow<List<DiscoveredServer>> = discoveryClient.discoveredServers
    val isScanning: StateFlow<Boolean> = discoveryClient.isScanning

    private var _scanAttempt = MutableStateFlow(0)
    val scanAttempt: StateFlow<Int> = _scanAttempt.asStateFlow()

    init {
        val savedMode = when (prefs.getString(PREF_CONNECTION_MODE, "local")) {
            "remote" -> ConnectionMode.REMOTE
            else -> ConnectionMode.LOCAL
        }
        val savedRemoteUrl = prefs.getString(PREF_REMOTE_URL, "") ?: ""

        _uiState.value = _uiState.value.copy(
            connectionMode = savedMode,
            remoteUrl = savedRemoteUrl
        )

        if (savedMode == ConnectionMode.REMOTE && savedRemoteUrl.isNotBlank()) {
            _uiState.value = _uiState.value.copy(
                serverUrl = savedRemoteUrl,
                showManualEntry = true,
                isVerifyingServer = true
            )
            verifyCachedServer(savedRemoteUrl)
        } else {
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
                        _uiState.value = _uiState.value.copy(
                            serverUrl = url,
                            isVerifyingServer = false,
                            isConnected = true,
                            errorMessage = null
                        )
                        return@launch
                    }
                }
                conn.disconnect()
            } catch (_: Exception) {
                // Probe failed
            }

            _uiState.value = _uiState.value.copy(isVerifyingServer = false)
            scanForServers()
        }
    }

    fun updateServerUrl(url: String) {
        _uiState.value = _uiState.value.copy(serverUrl = url)
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
                            isLoading = false,
                            isConnected = true,
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
            isConnected = true,
            errorMessage = null
        )
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
        _uiState.value = _uiState.value.copy(showManualEntry = show)
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
}
