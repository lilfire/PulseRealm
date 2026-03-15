package com.pulserealm.client.ui.session

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.SessionSummaryData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import com.pulserealm.client.service.DataStreamingService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class SessionViewModel @Inject constructor(
    private val application: Application,
    private val signalRClient: SignalRClient,
    private val sensorDataCollector: SensorDataCollector,
    savedStateHandle: SavedStateHandle
) : AndroidViewModel(application) {

    val sessionId: String = savedStateHandle["sessionId"] ?: ""
    val clientId: String = savedStateHandle["clientId"] ?: ""
    val serverUrl: String = savedStateHandle["serverUrl"] ?: ""

    val heartRate: StateFlow<Int> = sensorDataCollector.heartRate
    val steps: StateFlow<Int> = sensorDataCollector.steps
    val sensorsAvailable: StateFlow<Boolean> = sensorDataCollector.sensorsAvailable
    val connectionState: StateFlow<ConnectionState> = signalRClient.connectionState
    val sendCount: StateFlow<Int> = DataStreamingService.sendCount
    val sessionEnded: StateFlow<SessionSummaryData?> = signalRClient.sessionEnded

    private var isStreaming = false

    fun startStreaming() {
        if (isStreaming) return
        isStreaming = true

        val intent = Intent(application, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_SESSION_ID, sessionId)
            putExtra(DataStreamingService.EXTRA_CLIENT_ID, clientId)
            putExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L)
        }
        application.startForegroundService(intent)
    }

    fun stopStreaming() {
        if (!isStreaming) return
        isStreaming = false
        application.stopService(Intent(application, DataStreamingService::class.java))
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
