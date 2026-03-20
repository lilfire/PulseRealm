package com.pulserealm.client.ui.session

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import com.pulserealm.client.data.network.BindRequestData
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmSummaryData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.network.StrideCalibrationPoint
import org.json.JSONArray
import org.json.JSONObject
import com.pulserealm.client.data.sensor.SensorDataCollector
import com.pulserealm.client.service.DataStreamingService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
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

    /** True when the join code was for a calibration session rather than a realm. */
    val isCalibrationMode: Boolean = signalRClient.calibrationSessionId.value != null

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
        val json = prefs.getString("stride_calibration", null) ?: return null
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

    val calibrationComplete: StateFlow<List<StrideCalibrationPoint>?> = signalRClient.calibrationComplete

    fun resetSteps() {
        sensorDataCollector.resetSteps()
    }

    fun startStreaming() {
        if (isStreaming) return
        isStreaming = true

        requestBatteryOptimizationExemption()

        if (isCalibrationMode) {
            // Calibration sessions are not realms — send step data directly via SignalR
            // without starting the foreground DataStreamingService.
            sensorDataCollector.start()
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
        if (isCalibrationMode) {
            sensorDataCollector.stop()
        } else {
            application.stopService(Intent(application, DataStreamingService::class.java))
        }
    }

    /** Intentionally leave the realm. Returns true if a summary screen will appear. */
    fun leaveRealm(): Boolean {
        stopStreaming()
        return signalRClient.leaveRealm()
    }

    fun disconnect() {
        stopStreaming()
        signalRClient.disconnect()
    }

    override fun onCleared() {
        super.onCleared()
        disconnect()
    }
}
