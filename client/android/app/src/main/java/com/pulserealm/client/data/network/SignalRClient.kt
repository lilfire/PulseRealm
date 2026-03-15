package com.pulserealm.client.data.network

import com.microsoft.signalr.HubConnection
import com.microsoft.signalr.HubConnectionBuilder
import com.microsoft.signalr.HubConnectionState
import com.pulserealm.client.data.model.WearableData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.HashMap

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

data class SessionSummaryData(
    val durationSeconds: Double = 0.0,
    val totalDistanceMeters: Double = 0.0,
    val totalSteps: Int = 0,
    val averageHeartRate: Int = 0,
    val maxHeartRate: Int = 0,
    val averageSpeedKmh: Double = 0.0
)

class SignalRClient {

    private var hubConnection: HubConnection? = null
    private var currentJoinCode: String? = null
    private var currentClientId: String? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _sessionEnded = MutableStateFlow<SessionSummaryData?>(null)
    val sessionEnded: StateFlow<SessionSummaryData?> = _sessionEnded.asStateFlow()

    fun connect(serverUrl: String) {
        disconnect()

        _connectionState.value = ConnectionState.CONNECTING
        _error.value = null

        val url = serverUrl.trimEnd('/') + "/hubs/session"

        hubConnection = HubConnectionBuilder.create(url)
            .shouldSkipNegotiate(false)
            .build()

        hubConnection?.apply {
            on("ClientJoined", { clientId ->
                // Another client joined the session
            }, String::class.java)

            on("WearableDataReceived", { _ ->
                // Data from another client (not needed for wearable sender)
            }, Any::class.java)

            on("JoinedSession", { _ ->
                // Dashboard join confirmation (not applicable here)
            }, String::class.java)

            on("SessionEnded", { summaryMap ->
                @Suppress("UNCHECKED_CAST")
                val map = summaryMap as? Map<String, Any> ?: emptyMap()
                _sessionEnded.value = SessionSummaryData(
                    durationSeconds = (map["durationSeconds"] as? Number)?.toDouble() ?: 0.0,
                    totalDistanceMeters = (map["totalDistanceMeters"] as? Number)?.toDouble() ?: 0.0,
                    totalSteps = (map["totalSteps"] as? Number)?.toInt() ?: 0,
                    averageHeartRate = (map["averageHeartRate"] as? Number)?.toInt() ?: 0,
                    maxHeartRate = (map["maxHeartRate"] as? Number)?.toInt() ?: 0,
                    averageSpeedKmh = (map["averageSpeedKmh"] as? Number)?.toDouble() ?: 0.0
                )
            }, Any::class.java)

            on("Error", { message ->
                _error.value = message
            }, String::class.java)

            onClosed {
                _connectionState.value = ConnectionState.DISCONNECTED
            }
        }

        try {
            hubConnection?.start()?.blockingAwait()
            _connectionState.value = ConnectionState.CONNECTED
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.DISCONNECTED
            _error.value = "Connection failed: ${e.message}"
        }
    }

    fun joinSession(joinCode: String, clientId: String, name: String = "", heightCm: Double = 0.0, weightKg: Double = 0.0) {
        currentJoinCode = joinCode
        currentClientId = clientId

        try {
            val profile = HashMap<String, Any>().apply {
                put("clientId", clientId)
                put("name", name)
                put("heightCm", heightCm)
                put("weightKg", weightKg)
            }
            hubConnection?.invoke("JoinSession", joinCode, clientId, profile)?.blockingAwait()
        } catch (e: Exception) {
            _error.value = "Join failed: ${e.message}"
        }
    }

    fun sendWearableData(sessionId: String, data: WearableData) {
        if (hubConnection?.connectionState != HubConnectionState.CONNECTED) return

        try {
            val dataMap = HashMap<String, Any>().apply {
                put("clientId", data.clientId)
                put("heartRate", data.heartRate)
                put("steps", data.steps)
                put("timestamp", data.timestamp)
            }
            hubConnection?.invoke("SendWearableData", sessionId, dataMap)?.blockingAwait()
        } catch (e: Exception) {
            _error.value = "Send failed: ${e.message}"
        }
    }

    fun disconnect() {
        try {
            hubConnection?.stop()?.blockingAwait()
        } catch (_: Exception) {
        }
        hubConnection = null
        currentJoinCode = null
        currentClientId = null
        _connectionState.value = ConnectionState.DISCONNECTED
        _sessionEnded.value = null
    }

    fun isConnected(): Boolean {
        return hubConnection?.connectionState == HubConnectionState.CONNECTED
    }

    fun clearError() {
        _error.value = null
    }
}
