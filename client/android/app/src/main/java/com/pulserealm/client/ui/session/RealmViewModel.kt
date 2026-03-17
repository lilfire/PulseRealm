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
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmSummaryData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import com.pulserealm.client.service.DataStreamingService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
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

    val heartRate: StateFlow<Int> = sensorDataCollector.heartRate
    val steps: StateFlow<Int> = sensorDataCollector.steps
    val sensorsAvailable: StateFlow<Boolean> = sensorDataCollector.sensorsAvailable
    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState
    val sendCount: StateFlow<Int> = DataStreamingService.sendCount
    val realmEnded: StateFlow<RealmSummaryData?> = signalRClient.realmEnded
    val eliminated: StateFlow<Boolean> = signalRClient.eliminated
    val realmStarted: StateFlow<Boolean> = signalRClient.realmStarted

    private var isStreaming = false

    fun saveStrideFactor(factor: Double) {
        prefs.edit().putFloat("stride_factor", factor.toFloat()).apply()
    }

    fun resetSteps() {
        sensorDataCollector.resetSteps()
    }

    fun startStreaming() {
        if (isStreaming) return
        isStreaming = true

        requestBatteryOptimizationExemption()

        val intent = Intent(application, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_REALM_ID, realmId)
            putExtra(DataStreamingService.EXTRA_CLIENT_ID, clientId)
            putExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L)
        }
        application.startForegroundService(intent)
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

    fun stopStreaming() {
        if (!isStreaming) return
        isStreaming = false
        application.stopService(Intent(application, DataStreamingService::class.java))
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
