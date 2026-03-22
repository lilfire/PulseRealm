package com.pulserealm.client.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.os.IBinder
import android.os.PowerManager
import androidx.core.content.ContextCompat
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
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // Reset process-static calorie accumulator when the service is first created.
        // See companion object note below.
        resetState()
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
        val weightKg = intent.getDoubleExtra(EXTRA_WEIGHT_KG, 0.0)
        val age = intent.getIntExtra(EXTRA_AGE, 0)

        // Reset calorie accumulator at the start of each streaming session so that
        // back-to-back sessions do not carry over calories from the previous run.
        resetState()

        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWifiLock()
        acquireWakeLock()
        registerNetworkCallback()
        val hasBodySensors = ContextCompat.checkSelfPermission(
            this, Manifest.permission.BODY_SENSORS
        ) == PackageManager.PERMISSION_GRANTED
        sensorDataCollector.start(hasBodySensors)
        startStreaming(realmId, clientId, intervalMs, weightKg, age)

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        streamingJob?.cancel()
        sensorDataCollector.stop()
        unregisterNetworkCallback()
        releaseWifiLock()
        releaseWakeLock()
        scope.cancel()
        super.onDestroy()
    }

    private fun startStreaming(realmId: String, clientId: String, intervalMs: Long, weightKg: Double, age: Int) {
        streamingJob?.cancel()
        streamingJob = scope.launch {
            val intervalSec = intervalMs / 1000.0
            while (true) {
                try {
                    val hr = sensorDataCollector.heartRate.value
                    val data = WearableData(
                        clientId = clientId,
                        heartRate = hr,
                        steps = sensorDataCollector.steps.value,
                        timestamp = DateTimeFormatter.ISO_INSTANT.format(Instant.now().atOffset(ZoneOffset.UTC))
                    )
                    signalRClient.sendWearableData(realmId, data)
                    if (hr > 0 && weightKg > 0 && age > 0) {
                        val calsPerMin = (-37.549 + 0.5391 * hr + 0.1626 * weightKg + 0.1379 * age) / 4.184
                        val calsThisTick = (calsPerMin.coerceAtLeast(0.0) / 60.0) * intervalSec
                        _caloriesBurned.value += calsThisTick
                    }
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

    private fun registerNetworkCallback() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                signalRClient.onNetworkAvailable()
            }
        }
        networkCallback = callback
        cm.registerNetworkCallback(request, callback)
    }

    private fun unregisterNetworkCallback() {
        networkCallback?.let {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.unregisterNetworkCallback(it)
        }
        networkCallback = null
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
        const val EXTRA_WEIGHT_KG = "weight_kg"
        const val EXTRA_AGE = "age"
        private const val CHANNEL_ID = "pulserealm_streaming"
        private const val NOTIFICATION_ID = 1

        // NOTE: These flows live in the companion object (process-static) because
        // RealmViewModel reads them as a static reference while the service runs in
        // the background. This is intentional — Android services are singletons within
        // a process. Always call resetState() at the start of each session (both in
        // onCreate() and onStartCommand()) to prevent calorie bleed between sessions.
        private val _caloriesBurned = MutableStateFlow(0.0)
        val caloriesBurned: StateFlow<Double> = _caloriesBurned.asStateFlow()

        /** Resets all session-scoped state. Call at the start of every new session. */
        fun resetState() {
            _caloriesBurned.value = 0.0
        }
    }
}
