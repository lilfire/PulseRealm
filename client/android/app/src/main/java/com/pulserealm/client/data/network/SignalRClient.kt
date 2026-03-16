package com.pulserealm.client.data.network

import com.microsoft.signalr.HubConnection
import com.microsoft.signalr.HubConnectionBuilder
import com.microsoft.signalr.HubConnectionState
import com.pulserealm.client.data.model.WearableData
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.HashMap

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

data class ClientSummaryData(
    val clientId: String = "",
    val name: String = "",
    val steps: Int = 0,
    val distanceMeters: Double = 0.0,
    val averageHeartRate: Int = 0,
    val maxHeartRate: Int = 0,
    val avgCadenceSpm: Int = 0,
    val timeInZone: Map<String, Int> = emptyMap(),
    val teamName: String? = null,
    val teamColor: String? = null
)

data class RealmSummaryData(
    val durationSeconds: Double = 0.0,
    val totalDistanceMeters: Double = 0.0,
    val totalSteps: Int = 0,
    val averageHeartRate: Int = 0,
    val maxHeartRate: Int = 0,
    val averageSpeedKmh: Double = 0.0,
    val avgCadenceSpm: Int = 0,
    val timeInZone: Map<String, Int> = emptyMap(),
    val activePeriodSeconds: Double = 0.0,
    val participantCount: Int = 0,
    val isTeamFormat: Boolean = false,
    val clientSummaries: List<ClientSummaryData> = emptyList()
)

class SignalRClient {

    private var hubConnection: HubConnection? = null
    private var currentServerUrl: String? = null
    private var currentJoinCode: String? = null
    private var currentClientId: String? = null
    private var currentName: String = ""
    private var currentHeightCm: Double = 0.0
    private var currentWeightKg: Double = 0.0
    private var intentionalDisconnect = false
    private var reconnectJob: Job? = null
    private val reconnectScope = CoroutineScope(Dispatchers.IO + Job())

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _realmEnded = MutableStateFlow<RealmSummaryData?>(null)
    val realmEnded: StateFlow<RealmSummaryData?> = _realmEnded.asStateFlow()

    private val _eliminated = MutableStateFlow(false)
    val eliminated: StateFlow<Boolean> = _eliminated.asStateFlow()

    fun connect(serverUrl: String) {
        intentionalDisconnect = true
        disconnect()
        intentionalDisconnect = false

        currentServerUrl = serverUrl
        _connectionState.value = ConnectionState.CONNECTING
        _error.value = null

        val url = serverUrl.trimEnd('/') + "/hubs/realm"

        hubConnection = HubConnectionBuilder.create(url)
            .shouldSkipNegotiate(false)
            .build()

        registerHubHandlers(hubConnection!!)

        try {
            hubConnection?.start()?.blockingAwait()
            _connectionState.value = ConnectionState.CONNECTED
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.DISCONNECTED
            _error.value = "Connection failed: ${e.message}"
        }
    }

    private fun registerHubHandlers(connection: HubConnection) {
        connection.apply {
            on("ClientJoined", { _ ->
                // Another client joined the realm
            }, String::class.java)

            on("WearableDataReceived", { _ ->
                // Data from another client (not needed for wearable sender)
            }, Any::class.java)

            on("JoinedRealm", { _ ->
                // Dashboard join confirmation (not applicable here)
            }, String::class.java)

            on("ClientEliminated", { eliminatedClientId ->
                if (eliminatedClientId == currentClientId) {
                    _eliminated.value = true
                }
            }, String::class.java)

            on("RealmEnded", { summaryMap ->
                @Suppress("UNCHECKED_CAST")
                val map = summaryMap as? Map<String, Any> ?: emptyMap()

                val timeInZoneRaw = map["timeInZone"] as? Map<*, *> ?: emptyMap<String, Any>()
                val timeInZone = timeInZoneRaw.entries.associate {
                    it.key.toString() to ((it.value as? Number)?.toInt() ?: 0)
                }

                val csRaw = map["clientSummaries"] as? List<*> ?: emptyList<Any>()
                val clientSummaries = csRaw.mapNotNull { item ->
                    val csMap = item as? Map<*, *> ?: return@mapNotNull null
                    val csZoneRaw = csMap["timeInZone"] as? Map<*, *> ?: emptyMap<String, Any>()
                    ClientSummaryData(
                        clientId = csMap["clientId"]?.toString() ?: "",
                        name = csMap["name"]?.toString() ?: "",
                        steps = (csMap["steps"] as? Number)?.toInt() ?: 0,
                        distanceMeters = (csMap["distanceMeters"] as? Number)?.toDouble() ?: 0.0,
                        averageHeartRate = (csMap["averageHeartRate"] as? Number)?.toInt() ?: 0,
                        maxHeartRate = (csMap["maxHeartRate"] as? Number)?.toInt() ?: 0,
                        avgCadenceSpm = (csMap["avgCadenceSpm"] as? Number)?.toInt() ?: 0,
                        timeInZone = csZoneRaw.entries.associate {
                            it.key.toString() to ((it.value as? Number)?.toInt() ?: 0)
                        },
                        teamName = csMap["teamName"]?.toString(),
                        teamColor = csMap["teamColor"]?.toString()
                    )
                }

                _realmEnded.value = RealmSummaryData(
                    durationSeconds = (map["durationSeconds"] as? Number)?.toDouble() ?: 0.0,
                    totalDistanceMeters = (map["totalDistanceMeters"] as? Number)?.toDouble() ?: 0.0,
                    totalSteps = (map["totalSteps"] as? Number)?.toInt() ?: 0,
                    averageHeartRate = (map["averageHeartRate"] as? Number)?.toInt() ?: 0,
                    maxHeartRate = (map["maxHeartRate"] as? Number)?.toInt() ?: 0,
                    averageSpeedKmh = (map["averageSpeedKmh"] as? Number)?.toDouble() ?: 0.0,
                    avgCadenceSpm = (map["avgCadenceSpm"] as? Number)?.toInt() ?: 0,
                    timeInZone = timeInZone,
                    activePeriodSeconds = (map["activePeriodSeconds"] as? Number)?.toDouble() ?: 0.0,
                    participantCount = (map["participantCount"] as? Number)?.toInt() ?: 0,
                    isTeamFormat = map["isTeamFormat"] as? Boolean ?: false,
                    clientSummaries = clientSummaries
                )
            }, Any::class.java)

            on("Error", { message ->
                _error.value = message
            }, String::class.java)

            onClosed {
                if (!intentionalDisconnect && currentJoinCode != null) {
                    _connectionState.value = ConnectionState.RECONNECTING
                    attemptReconnect()
                } else {
                    _connectionState.value = ConnectionState.DISCONNECTED
                }
            }
        }
    }

    fun joinRealm(joinCode: String, clientId: String, name: String = "", heightCm: Double = 0.0, weightKg: Double = 0.0) {
        currentJoinCode = joinCode
        currentClientId = clientId
        currentName = name
        currentHeightCm = heightCm
        currentWeightKg = weightKg

        try {
            val profile = HashMap<String, Any>().apply {
                put("clientId", clientId)
                put("name", name)
                put("heightCm", heightCm)
                put("weightKg", weightKg)
            }
            hubConnection?.invoke("JoinRealm", joinCode, clientId, profile)?.blockingAwait()
        } catch (e: Exception) {
            _error.value = "Join failed: ${e.message}"
        }
    }

    fun sendWearableData(realmId: String, data: WearableData) {
        if (hubConnection?.connectionState != HubConnectionState.CONNECTED) return

        try {
            val dataMap = HashMap<String, Any>().apply {
                put("clientId", data.clientId)
                put("heartRate", data.heartRate)
                put("steps", data.steps)
                put("timestamp", data.timestamp)
            }
            hubConnection?.invoke("SendWearableData", realmId, dataMap)?.blockingAwait()
        } catch (e: Exception) {
            _error.value = "Send failed: ${e.message}"
        }
    }

    fun disconnect() {
        intentionalDisconnect = true
        reconnectJob?.cancel()
        reconnectJob = null
        try {
            hubConnection?.stop()?.blockingAwait()
        } catch (_: Exception) {
        }
        hubConnection = null
        currentServerUrl = null
        currentJoinCode = null
        currentClientId = null
        _connectionState.value = ConnectionState.DISCONNECTED
        _realmEnded.value = null
        _eliminated.value = false
    }

    private fun attemptReconnect() {
        reconnectJob?.cancel()
        reconnectJob = reconnectScope.launch {
            val maxAttempts = 10
            var attempt = 0
            while (attempt < maxAttempts) {
                attempt++
                val delayMs = (2000L * (1L shl (attempt - 1).coerceAtMost(4))).coerceAtMost(30_000L)
                delay(delayMs)

                val serverUrl = currentServerUrl ?: break
                val joinCode = currentJoinCode ?: break
                val clientId = currentClientId ?: break

                try {
                    val url = serverUrl.trimEnd('/') + "/hubs/realm"
                    val newConnection = HubConnectionBuilder.create(url)
                        .shouldSkipNegotiate(false)
                        .build()
                    registerHubHandlers(newConnection)
                    newConnection.start()?.blockingAwait()
                    hubConnection = newConnection
                    _connectionState.value = ConnectionState.CONNECTED

                    // Re-join the realm
                    val profile = HashMap<String, Any>().apply {
                        put("clientId", clientId)
                        put("name", currentName)
                        put("heightCm", currentHeightCm)
                        put("weightKg", currentWeightKg)
                    }
                    hubConnection?.invoke("JoinRealm", joinCode, clientId, profile)?.blockingAwait()
                    return@launch
                } catch (_: Exception) {
                    // Will retry on next iteration
                }
            }
            // Exhausted all attempts
            _connectionState.value = ConnectionState.DISCONNECTED
            _error.value = "Lost connection to server"
        }
    }

    fun isConnected(): Boolean {
        return hubConnection?.connectionState == HubConnectionState.CONNECTED
    }

    fun clearError() {
        _error.value = null
    }
}
