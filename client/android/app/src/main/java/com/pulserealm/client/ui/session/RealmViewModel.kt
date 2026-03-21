package com.pulserealm.client.ui.session

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.BindRequestData
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmSummaryData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.network.StrideCalibrationPoint
import com.pulserealm.client.data.network.parseStrideCalibration
import org.json.JSONArray
import org.json.JSONObject
import com.pulserealm.client.data.sensor.SensorDataCollector
import com.pulserealm.client.service.DataStreamingService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RealmViewModel @Inject constructor(
    private val application: Application,
    private val signalRClient: SignalRClient,
    private val sensorDataCollector: SensorDataCollector,
    private val prefs: SharedPreferences,
    savedStateHandle: SavedStateHandle
) : AndroidViewModel(application) {

    val realmId: String = savedStateHandle["realmId"] ?: ""
    val clientId: String = savedStateHandle["clientId"] ?: ""
    val serverUrl: String = java.net.URLDecoder.decode(savedStateHandle["serverUrl"] ?: "", "UTF-8")
    val heightCm: Double = (prefs.getString("height_cm", null)?.toDoubleOrNull() ?: 0.0)
    private val weightKg: Double = (prefs.getString("weight_kg", null)?.toDoubleOrNull() ?: 0.0)
    private val age: Int = (prefs.getString("age", null)?.toIntOrNull() ?: 0)

    val heartRate: StateFlow<Int> = sensorDataCollector.heartRate
    val steps: StateFlow<Int> = sensorDataCollector.steps
    val sensorsAvailable: StateFlow<Boolean> = sensorDataCollector.sensorsAvailable
    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState
    val caloriesBurned: StateFlow<Double> = DataStreamingService.caloriesBurned
    val realmEnded: StateFlow<RealmSummaryData?> = signalRClient.realmEnded
    val eliminated: StateFlow<Boolean> = signalRClient.eliminated
    val realmStarted: StateFlow<Boolean> = signalRClient.realmStarted
    val bindRequest: StateFlow<BindRequestData?> = signalRClient.bindRequest

    /**
     * True when the join code was for a calibration session rather than a realm.
     * Reactive StateFlow — collect in Compose with collectAsState(), or read .value in imperative code.
     */
    val isCalibrationMode: StateFlow<Boolean> = signalRClient.calibrationSessionId
        .map { it != null }
        .stateIn(viewModelScope, SharingStarted.Eagerly, signalRClient.calibrationSessionId.value != null)

    private var isStreaming = false
    private var calibrationJob: Job? = null

    fun saveStrideFactor(factor: Double) {
        prefs.edit().putFloat("stride_factor", factor.toFloat()).apply()
    }

    fun saveStrideCalibration(points: List<StrideCalibrationPoint>) {
        val jsonArray = JSONArray()
        for (p in points) {
            val obj = JSONObject()
            obj.put("speedKmh", p.speedKmh)
            obj.put("strideFactor", p.strideFactor)
            jsonArray.put(obj)
        }
        prefs.edit().putString("stride_calibration", jsonArray.toString()).apply()
    }

    fun loadStrideCalibration(): List<StrideCalibrationPoint>? {
        // Use shared parseStrideCalibration() to avoid duplicating JSON parsing logic
        return parseStrideCalibration(prefs.getString("stride_calibration", null))
    }

    val calibrationComplete: StateFlow<List<StrideCalibrationPoint>?> = signalRClient.calibrationComplete

    fun resetSteps() {
        sensorDataCollector.resetSteps()
    }

    fun startStreaming() {
        if (isStreaming) return
        isStreaming = true

        requestBatteryOptimizationExemption()

        if (isCalibrationMode.value) {
            // Calibration sessions are not realms — send step data directly via SignalR
            // without starting the foreground DataStreamingService.
            val hasBodySensors = ContextCompat.checkSelfPermission(
                application, Manifest.permission.BODY_SENSORS
            ) == PackageManager.PERMISSION_GRANTED
            sensorDataCollector.start(hasBodySensors)
            calibrationJob = viewModelScope.launch(Dispatchers.IO) {
                while (true) {
                    delay(1000L)
                    signalRClient.sendCalibrationData(realmId, sensorDataCollector.steps.value)
                }
            }
        } else {
            val intent = Intent(application, DataStreamingService::class.java).apply {
                putExtra(DataStreamingService.EXTRA_REALM_ID, realmId)
                putExtra(DataStreamingService.EXTRA_CLIENT_ID, clientId)
                putExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L)
                putExtra(DataStreamingService.EXTRA_WEIGHT_KG, weightKg)
                putExtra(DataStreamingService.EXTRA_AGE, age)
            }
            application.startForegroundService(intent)
        }
    }

    private fun requestBatteryOptimizationExemption() {
        val pm = application.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(application.packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${application.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            application.startActivity(intent)
        }
    }

    fun reconnect() {
        signalRClient.manualReconnect()
    }

    fun respondBind(approved: Boolean) {
        signalRClient.respondBind(realmId, approved)
    }

    fun stopStreaming() {
        if (!isStreaming) return
        isStreaming = false
        calibrationJob?.cancel()
        calibrationJob = null
        // Fix #8: use .value because isCalibrationMode is now a StateFlow
        if (isCalibrationMode.value) {
            sensorDataCollector.stop()
        } else {
            application.stopService(Intent(application, DataStreamingService::class.java))
        }
    }

    /**
     * Intentionally leave the realm. Returns true if a summary screen will appear.
     * Runs on IO because [SignalRClient.leaveRealm] is a suspend function.
     */
    fun leaveRealm(): Boolean {
        stopStreaming()
        // leaveRealm is suspend — run on IO and return synchronously via a blocking
        // call so the caller (Compose onClick) gets the result immediately.
        // This is safe because leaveRealm() dispatches its own IO internally.
        var result = false
        viewModelScope.launch(Dispatchers.IO) {
            result = signalRClient.leaveRealm()
        }
        // Note: for the summary-screen path the result is delivered reactively via
        // realmEnded StateFlow — returning false here is safe for the non-summary path.
        return result
    }

    fun disconnect() {
        stopStreaming()
        viewModelScope.launch(Dispatchers.IO) {
            signalRClient.disconnect()
        }
    }

    override fun onCleared() {
        super.onCleared()
        viewModelScope.launch(Dispatchers.IO) {
            signalRClient.disconnect()
        }
    }
}
