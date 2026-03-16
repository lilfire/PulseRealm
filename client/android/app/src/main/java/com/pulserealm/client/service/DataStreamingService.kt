package com.pulserealm.client.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.IBinder
import android.os.PowerManager
import com.pulserealm.client.R
import com.pulserealm.client.data.model.WearableData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@AndroidEntryPoint
class DataStreamingService : Service() {

    @Inject lateinit var signalRClient: SignalRClient
    @Inject lateinit var sensorDataCollector: SensorDataCollector

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var streamingJob: Job? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val realmId = intent?.getStringExtra(EXTRA_REALM_ID) ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        val clientId = intent.getStringExtra(EXTRA_CLIENT_ID) ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        val intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, 1000L)

        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWifiLock()
        acquireWakeLock()
        sensorDataCollector.start()
        startStreaming(realmId, clientId, intervalMs)

        _sendCount.value = 0

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        streamingJob?.cancel()
        sensorDataCollector.stop()
        releaseWifiLock()
        releaseWakeLock()
        scope.cancel()
        super.onDestroy()
    }

    private fun startStreaming(realmId: String, clientId: String, intervalMs: Long) {
        streamingJob?.cancel()
        streamingJob = scope.launch {
            while (true) {
                try {
                    val data = WearableData(
                        clientId = clientId,
                        heartRate = sensorDataCollector.heartRate.value,
                        steps = sensorDataCollector.steps.value,
                        timestamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now().atOffset(ZoneOffset.UTC))
                    )
                    signalRClient.sendWearableData(realmId, data)
                    _sendCount.update { it + 1 }
                } catch (_: Exception) {
                    // Transient send failure — continue on next cycle
                }
                delay(intervalMs)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun acquireWifiLock() {
        // WIFI_MODE_FULL_HIGH_PERF is deprecated on API 29+ and operates as WIFI_MODE_FULL automatically.
        // Kept for backward compatibility with API < 29 devices.
        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "PulseRealm:Streaming")
        wifiLock?.setReferenceCounted(false)
        wifiLock?.acquire()
    }

    private fun releaseWifiLock() {
        if (wifiLock?.isHeld == true) {
            wifiLock?.release()
        }
        wifiLock = null
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PulseRealm:Streaming")
        wakeLock?.setReferenceCounted(false)
        wakeLock?.acquire(4 * 60 * 60 * 1000L) // 4-hour timeout safety net
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
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
        const val EXTRA_REALM_ID = "realm_id"
        const val EXTRA_CLIENT_ID = "client_id"
        const val EXTRA_INTERVAL_MS = "interval_ms"
        private const val CHANNEL_ID = "pulserealm_streaming"
        private const val NOTIFICATION_ID = 1

        private val _sendCount = MutableStateFlow(0)
        val sendCount: StateFlow<Int> = _sendCount.asStateFlow()
    }
}
