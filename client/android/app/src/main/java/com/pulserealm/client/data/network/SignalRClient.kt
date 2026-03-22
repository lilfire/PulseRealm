package com.pulserealm.client.data.network

import com.microsoft.signalr.HubConnection
import com.microsoft.signalr.HubConnectionBuilder
import com.microsoft.signalr.HubConnectionState
import com.pulserealm.client.data.model.WearableData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Parses a JSON string (produced by [StrideCalibrationPoint] serialization) into a list of
 * calibration points. Returns null if the input is blank or malformed.
 *
 * Expected format: `[{"speedKmh":8.0,"strideFactor":0.42}, ...]`
 */
fun parseStrideCalibration(json: String?): List<StrideCalibrationPoint>? {
    if (json.isNullOrBlank()) return null
    return try {
        val arr = JSONArray(json)
        (0 until arr.length()).map { i ->
            val obj = arr.getJSONObject(i)
            StrideCalibrationPoint(
                speedKmh = obj.getDouble("speedKmh"),
                strideFactor = obj.getDouble("strideFactor")
            )
        }
    } catch (_: Exception) {
        null
    }
}

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

data class BindRequestData(
    val code: String
)

data class StrideCalibrationPoint(
    val speedKmh: Double = 0.0,
    val strideFactor: Double = 0.0
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

/**
 * SignalR client for the PulseRealm hub.
 *
 * This class is annotated [@Singleton][javax.inject.Singleton] via Hilt and therefore lives for
 * the lifetime of the application process. The default [reconnectScope] uses a [SupervisorJob]
 * so individual reconnect attempts do not cancel the parent scope. The scope is intentionally
 * app-scoped — it must not be tied to a ViewModel or Activity lifecycle because reconnects
 * need to survive configuration changes. Always call [dispose] when the client is no longer
 * needed (e.g. during app shutdown) to cancel the SupervisorJob and release resources.
 */
class SignalRClient(
    private val reconnectScope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
    private val healthCheckEnabled: Boolean = true
) {

    @Volatile private var hubConnection: HubConnection? = null
    @Volatile private var currentServerUrl: String? = null
    @Volatile private var currentJoinCode: String? = null
    @Volatile private var currentClientId: String? = null
    @Volatile private var currentName: String = ""
    @Volatile private var currentAge: Int = 0
    @Volatile private var currentHeightCm: Double = 0.0
    @Volatile private var currentWeightKg: Double = 0.0
    @Volatile private var currentStrideFactor: Double = 0.0
    @Volatile private var currentStrideCalibration: List<StrideCalibrationPoint>? = null
    @Volatile private var currentZoneBounds: DoubleArray? = null
    @Volatile private var currentMaxHr: Int = 0
    private val intentionalDisconnect = AtomicBoolean(false)
    private var reconnectJob: Job? = null
    private var healthCheckJob: Job? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _realmEnded = MutableStateFlow<RealmSummaryData?>(null)
    val realmEnded: StateFlow<RealmSummaryData?> = _realmEnded.asStateFlow()

    private val _eliminated = MutableStateFlow(false)
    val eliminated: StateFlow<Boolean> = _eliminated.asStateFlow()

    private val _realmStarted = MutableStateFlow(false)
    val realmStarted: StateFlow<Boolean> = _realmStarted.asStateFlow()

    private val _bindRequest = MutableStateFlow<BindRequestData?>(null)
    val bindRequest: StateFlow<BindRequestData?> = _bindRequest.asStateFlow()

    private val _calibrationComplete = MutableStateFlow<List<StrideCalibrationPoint>?>(null)
    val calibrationComplete: StateFlow<List<StrideCalibrationPoint>?> = _calibrationComplete.asStateFlow()

    private val _calibrationSessionId = MutableStateFlow<String?>(null)
    val calibrationSessionId: StateFlow<String?> = _calibrationSessionId.asStateFlow()

    suspend fun connect(serverUrl: String) = withContext(Dispatchers.IO) {
        intentionalDisconnect.set(true)
        disconnectInternal()
        intentionalDisconnect.set(false)

        currentServerUrl = serverUrl
        _connectionState.value = ConnectionState.CONNECTING
        _error.value = null

        val url = serverUrl.trimEnd('/') + "/hubs/realm"

        val connection = HubConnectionBuilder.create(url)
            .shouldSkipNegotiate(false)
            .build()

        registerHubHandlers(connection)

        try {
            connection.start()?.blockingAwait()
            hubConnection = connection
            _connectionState.value = ConnectionState.CONNECTED
            startHealthCheck()
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.DISCONNECTED
            _error.value = UserFriendlyErrors.fromException(e, "Could not connect to the server")
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

            on("RealmStarted", { _ ->
                _realmStarted.value = true
            }, Any::class.java)

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

            on("BindRequest", { code ->
                _bindRequest.value = BindRequestData(code = code)
            }, String::class.java)

            on("BindCancelled", {
                _bindRequest.value = null
            })

            on("YouWereKicked", {
                _error.value = "You were kicked from the realm"
                _connectionState.value = ConnectionState.DISCONNECTED
                connection.stop()
            })

            on("CalibrationComplete", { pointsRaw ->
                @Suppress("UNCHECKED_CAST")
                val list = pointsRaw as? List<*> ?: emptyList<Any>()
                val points = list.mapNotNull { item ->
                    val map = item as? Map<*, *> ?: return@mapNotNull null
                    StrideCalibrationPoint(
                        speedKmh = (map["speedKmh"] as? Number)?.toDouble() ?: return@mapNotNull null,
                        strideFactor = (map["strideFactor"] as? Number)?.toDouble() ?: return@mapNotNull null
                    )
                }
                if (points.isNotEmpty()) {
                    _calibrationComplete.value = points
                }
            }, Any::class.java)

            on("JoinedCalibrationSession", { sessionId ->
                _calibrationSessionId.value = sessionId
            }, String::class.java)

            on("Error", { message ->
                _error.value = UserFriendlyErrors.fromRawMessage(message, "Something went wrong")
            }, String::class.java)

            onClosed {
                if (!intentionalDisconnect.get() && currentJoinCode != null) {
                    _connectionState.value = ConnectionState.RECONNECTING
                    attemptReconnect()
                } else {
                    _connectionState.value = ConnectionState.DISCONNECTED
                }
            }
        }
    }

    suspend fun joinRealm(joinCode: String, clientId: String, name: String = "", age: Int = 0, heightCm: Double = 0.0, weightKg: Double = 0.0, strideFactor: Double = 0.0, strideCalibration: List<StrideCalibrationPoint>? = null, zoneBounds: DoubleArray? = null, maxHr: Int = 0) = withContext(Dispatchers.IO) {
        currentJoinCode = joinCode
        currentClientId = clientId
        currentName = name
        currentAge = age
        currentHeightCm = heightCm
        currentWeightKg = weightKg
        currentStrideFactor = strideFactor
        currentStrideCalibration = strideCalibration
        currentZoneBounds = zoneBounds
        currentMaxHr = maxHr

        val profile = buildProfile(clientId, name, age, heightCm, weightKg, strideFactor, strideCalibration, zoneBounds, maxHr)

        try {
            hubConnection?.invoke("JoinRealm", joinCode, clientId, profile)?.blockingAwait()
        } catch (e: Exception) {
            val friendlyMessage = UserFriendlyErrors.fromException(e, "Could not join the realm")
            _error.value = friendlyMessage
            throw Exception(friendlyMessage, e)
        }
    }

    /**
     * Builds the profile map sent to the server on join and reconnect.
     * Returns null when the profile is incomplete (no name/age/height/weight).
     */
    private fun buildProfile(
        clientId: String,
        name: String,
        age: Int,
        heightCm: Double,
        weightKg: Double,
        strideFactor: Double,
        strideCalibration: List<StrideCalibrationPoint>?,
        zoneBounds: DoubleArray?,
        maxHr: Int
    ): HashMap<String, Any>? {
        val hasProfile = name.isNotBlank() && age > 0 && heightCm > 0.0 && weightKg > 0.0
        return if (hasProfile) hashMapOf<String, Any>(
            "clientId" to clientId,
            "name" to name,
            "age" to age,
            "heightCm" to heightCm,
            "weightKg" to weightKg,
            "strideFactor" to strideFactor
        ).also {
            if (strideCalibration != null && strideCalibration.isNotEmpty()) {
                it["strideCalibration"] = strideCalibration.map { p ->
                    hashMapOf("speedKmh" to p.speedKmh, "strideFactor" to p.strideFactor)
                }
            }
            if (zoneBounds != null) it["zoneBounds"] = zoneBounds.toList()
            if (maxHr > 0) it["maxHr"] = maxHr
        } else null
    }

    fun respondBind(realmId: String, approved: Boolean) {
        _bindRequest.value = null
        hubConnection?.send("RespondBind", realmId, approved)
    }

    fun sendWearableData(realmId: String, data: WearableData) {
        val conn = hubConnection
        if (conn == null || conn.connectionState != HubConnectionState.CONNECTED) {
            // Hub reports not connected — sync our state and trigger reconnect
            if (_connectionState.value == ConnectionState.CONNECTED && !intentionalDisconnect.get() && currentJoinCode != null) {
                _connectionState.value = ConnectionState.RECONNECTING
                attemptReconnect()
            }
            return
        }

        val dataMap = hashMapOf<String, Any>(
            "clientId" to data.clientId,
            "heartRate" to data.heartRate,
            "steps" to data.steps,
            "timestamp" to data.timestamp
        )
        try {
            conn.send("SendWearableData", realmId, dataMap)
        } catch (_: Exception) {
            // Send failed — connection is likely dead, trigger reconnect
            if (_connectionState.value == ConnectionState.CONNECTED && !intentionalDisconnect.get() && currentJoinCode != null) {
                _connectionState.value = ConnectionState.RECONNECTING
                attemptReconnect()
            }
        }
    }

    fun sendCalibrationData(sessionId: String, steps: Int) {
        val conn = hubConnection
        if (conn == null || conn.connectionState != HubConnectionState.CONNECTED) return
        try {
            conn.send("SendCalibrationData", sessionId, steps)
        } catch (_: Exception) { }
    }

    /**
     * Intentionally leave the realm. If the realm was started, the server sends
     * a RealmEnded summary and this returns true — the caller should wait for the
     * user to dismiss the summary before calling [disconnect].
     *
     * Must be called from a coroutine. Blocking hub I/O is dispatched to [Dispatchers.IO].
     */
    suspend fun leaveRealm(): Boolean = withContext(Dispatchers.IO) {
        intentionalDisconnect.set(true)
        reconnectJob?.cancel()
        reconnectJob = null
        try {
            val hasSummary = hubConnection
                ?.invoke(Boolean::class.java, "LeaveRealm")
                ?.blockingGet() ?: false
            if (hasSummary) return@withContext true
        } catch (_: Exception) { }
        disconnectInternal()
        false
    }

    /**
     * Intentionally disconnect from the hub.
     *
     * Must be called from a coroutine. Blocking hub I/O is dispatched to [Dispatchers.IO].
     */
    suspend fun disconnect() = withContext(Dispatchers.IO) {
        intentionalDisconnect.set(true)
        disconnectInternal()
    }

    private fun disconnectInternal() {
        healthCheckJob?.cancel()
        healthCheckJob = null
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
        _realmStarted.value = false
        _bindRequest.value = null
        _calibrationSessionId.value = null
    }

    /**
     * Called externally when network connectivity is restored (e.g. WiFi back after Doze).
     * Skips backoff and reconnects immediately if the connection is currently down.
     */
    /**
     * Manually triggered reconnect (e.g. from a UI button).
     * Resets the intentional-disconnect flag so reconnection is allowed.
     */
    fun manualReconnect() {
        if (_connectionState.value == ConnectionState.CONNECTED) return
        if (currentJoinCode == null || currentServerUrl == null) return
        intentionalDisconnect.set(false)
        _connectionState.value = ConnectionState.RECONNECTING
        reconnectJob?.cancel()
        attemptReconnect(immediateFirstAttempt = true)
    }

    fun onNetworkAvailable() {
        val conn = hubConnection
        if (intentionalDisconnect.get()) return
        if (currentJoinCode == null) return
        if (conn != null && conn.connectionState == HubConnectionState.CONNECTED) return

        _connectionState.value = ConnectionState.RECONNECTING
        reconnectJob?.cancel()
        attemptReconnect(immediateFirstAttempt = true)
    }

    /**
     * Periodically pings the server to verify the connection is truly alive.
     * Catches silent disconnects where onClosed never fires (e.g. server loses WiFi,
     * or Android network drops without a clean TCP close).
     * Uses invoke("Ping") which requires a server response — if unreachable, it throws.
     */
    private fun startHealthCheck() {
        if (!healthCheckEnabled) return
        healthCheckJob?.cancel()
        healthCheckJob = reconnectScope.launch {
            var consecutiveFailures = 0
            while (true) {
                delay(10_000L)
                if (intentionalDisconnect.get()) break
                val conn = hubConnection ?: break

                if (conn.connectionState != HubConnectionState.CONNECTED) {
                    triggerReconnectIfNeeded()
                    break
                }

                try {
                    conn.invoke(Boolean::class.java, "Ping")
                        .timeout(5, java.util.concurrent.TimeUnit.SECONDS)
                        .blockingGet()
                    consecutiveFailures = 0
                } catch (_: Exception) {
                    consecutiveFailures++
                    if (consecutiveFailures >= 2) {
                        triggerReconnectIfNeeded()
                        break
                    }
                }
            }
        }
    }

    private fun triggerReconnectIfNeeded() {
        if (_connectionState.value == ConnectionState.CONNECTED && !intentionalDisconnect.get() && currentJoinCode != null) {
            _connectionState.value = ConnectionState.RECONNECTING
            attemptReconnect()
        }
    }

    private fun attemptReconnect(immediateFirstAttempt: Boolean = false) {
        reconnectJob?.cancel()
        reconnectJob = reconnectScope.launch {
            val maxAttempts = 10
            var attempt = 0
            while (attempt < maxAttempts) {
                attempt++
                if (!(immediateFirstAttempt && attempt == 1)) {
                    val delayMs = (2000L * (1L shl (attempt - 1).coerceAtMost(4))).coerceAtMost(30_000L)
                    delay(delayMs)
                }

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

                    // Re-join the realm — use buildProfile() so strideCalibration is included
                    val profile = buildProfile(
                        clientId, currentName, currentAge, currentHeightCm, currentWeightKg,
                        currentStrideFactor, currentStrideCalibration, currentZoneBounds, currentMaxHr
                    )
                    hubConnection?.invoke("JoinRealm", joinCode, clientId, profile)?.blockingAwait()
                    startHealthCheck()
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

    fun dispose() {
        // Call disconnectInternal() directly (non-suspend) so dispose() itself
        // does not need to be a suspend function. This is safe because dispose()
        // is only called during app teardown (e.g. ViewModel.onCleared via scope).
        intentionalDisconnect.set(true)
        disconnectInternal()
        reconnectScope.coroutineContext[Job]?.cancel()
    }
}
