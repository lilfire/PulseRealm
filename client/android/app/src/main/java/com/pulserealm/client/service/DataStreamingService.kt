package com.pulserealm.client.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.pulserealm.client.R
import com.pulserealm.client.data.model.WearableData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@AndroidEntryPoint
class DataStreamingService : Service() {

    @Inject lateinit var signalRClient: SignalRClient
    @Inject lateinit var sensorDataCollector: SensorDataCollector

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var streamingJob: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sessionId = intent?.getStringExtra(EXTRA_SESSION_ID) ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        val clientId = intent.getStringExtra(EXTRA_CLIENT_ID) ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        val intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, 1000L)

        startForeground(NOTIFICATION_ID, buildNotification())
        sensorDataCollector.start()
        startStreaming(sessionId, clientId, intervalMs)

        _sendCount.value = 0

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        streamingJob?.cancel()
        sensorDataCollector.stop()
        scope.cancel()
        super.onDestroy()
    }

    private fun startStreaming(sessionId: String, clientId: String, intervalMs: Long) {
        streamingJob?.cancel()
        streamingJob = scope.launch {
            while (true) {
                val data = WearableData(
                    clientId = clientId,
                    heartRate = sensorDataCollector.heartRate.value,
                    steps = sensorDataCollector.steps.value,
                    timestamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now().atOffset(ZoneOffset.UTC))
                )
                signalRClient.sendWearableData(sessionId, data)
                _sendCount.value = _sendCount.value + 1
                delay(intervalMs)
            }
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.streaming_notification_channel),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            setShowBadge(false)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.streaming_notification_title))
            .setContentText(getString(R.string.streaming_notification_text))
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_CLIENT_ID = "client_id"
        const val EXTRA_INTERVAL_MS = "interval_ms"
        private const val CHANNEL_ID = "pulserealm_streaming"
        private const val NOTIFICATION_ID = 1

        private val _sendCount = MutableStateFlow(0)
        val sendCount: StateFlow<Int> = _sendCount.asStateFlow()
    }
}
