package com.pulserealm.client.data.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Timer
import java.util.TimerTask

class SensorDataCollector(
    private val sensorManager: SensorManager
) : SensorEventListener {

    private val _heartRate = MutableStateFlow(0)
    val heartRate: StateFlow<Int> = _heartRate.asStateFlow()

    private val _steps = MutableStateFlow(0)
    val steps: StateFlow<Int> = _steps.asStateFlow()

    private val _sensorsAvailable = MutableStateFlow(false)
    val sensorsAvailable: StateFlow<Boolean> = _sensorsAvailable.asStateFlow()

    private var stepBaseline: Float? = null
    private var isRunning = false
    private var simulationTimer: Timer? = null

    fun start() {
        if (isRunning) return
        isRunning = true

        val heartRateSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
        val stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

        if (heartRateSensor != null || stepSensor != null) {
            _sensorsAvailable.value = true

            heartRateSensor?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
            }
            stepSensor?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
            }
        } else {
            // No sensors available (emulator) — use simulated data
            _sensorsAvailable.value = false
            startSimulation()
        }
    }

    fun stop() {
        if (!isRunning) return
        isRunning = false
        sensorManager.unregisterListener(this)
        simulationTimer?.cancel()
        simulationTimer = null
        stepBaseline = null
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_HEART_RATE -> {
                val hr = event.values[0].toInt()
                if (hr > 0) {
                    _heartRate.value = hr
                }
            }
            Sensor.TYPE_STEP_COUNTER -> {
                val totalSteps = event.values[0]
                if (stepBaseline == null) {
                    stepBaseline = totalSteps
                }
                _steps.value = (totalSteps - (stepBaseline ?: totalSteps)).toInt()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // No-op
    }

    private fun startSimulation() {
        var simSteps = 0
        simulationTimer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    if (!isRunning) return
                    // Simulate heart rate between 60-180 bpm with slight variation
                    val baseHr = 90 + (Math.sin(System.currentTimeMillis() / 5000.0) * 40).toInt()
                    val jitter = (-5..5).random()
                    _heartRate.value = (baseHr + jitter).coerceIn(60, 180)

                    // Increment steps occasionally
                    if ((0..2).random() > 0) {
                        simSteps++
                        _steps.value = simSteps
                    }
                }
            }, 0L, 1000L)
        }
    }
}
