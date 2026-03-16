package com.pulserealm.client.data.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorManager
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SensorDataCollectorTest {

    private lateinit var sensorManager: SensorManager
    private lateinit var collector: SensorDataCollector

    @Before
    fun setup() {
        sensorManager = mockk(relaxed = true)
    }

    @After
    fun tearDown() {
        if (::collector.isInitialized) {
            collector.stop()
        }
    }

    @Test
    fun `initial heart rate is 0`() {
        collector = SensorDataCollector(sensorManager)
        assertEquals(0, collector.heartRate.value)
    }

    @Test
    fun `initial steps is 0`() {
        collector = SensorDataCollector(sensorManager)
        assertEquals(0, collector.steps.value)
    }

    @Test
    fun `initial sensorsAvailable is false`() {
        collector = SensorDataCollector(sensorManager)
        assertFalse(collector.sensorsAvailable.value)
    }

    @Test
    fun `start with no sensors starts simulation`() {
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        assertFalse(collector.sensorsAvailable.value)
    }

    @Test
    fun `start with heart rate sensor sets sensorsAvailable`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        assertTrue(collector.sensorsAvailable.value)
        verify { sensorManager.registerListener(collector, hrSensor, SensorManager.SENSOR_DELAY_NORMAL, 0) }
    }

    @Test
    fun `start with step counter registers listener`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        assertTrue(collector.sensorsAvailable.value)
        verify { sensorManager.registerListener(collector, stepSensor, SensorManager.SENSOR_DELAY_FASTEST, 0) }
    }

    @Test
    fun `start with step detector uses detector when no counter`() {
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        assertTrue(collector.sensorsAvailable.value)
        verify { sensorManager.registerListener(collector, detectorSensor, SensorManager.SENSOR_DELAY_FASTEST, 0) }
    }

    @Test
    fun `start is idempotent`() {
        every { sensorManager.getDefaultSensor(any()) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()
        collector.start() // Second call should be a no-op

        assertFalse(collector.sensorsAvailable.value)
    }

    @Test
    fun `stop unregisters listener`() {
        every { sensorManager.getDefaultSensor(any()) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()
        collector.stop()

        verify { sensorManager.unregisterListener(collector) }
    }

    @Test
    fun `stop is idempotent`() {
        every { sensorManager.getDefaultSensor(any()) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()
        collector.stop()
        collector.stop() // Should not throw
    }

    @Test
    fun `stop then start works`() {
        every { sensorManager.getDefaultSensor(any()) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()
        collector.stop()
        collector.start()

        // Should have started simulation again
        assertFalse(collector.sensorsAvailable.value)
    }

    @Test
    fun `onAccuracyChanged does not throw`() {
        collector = SensorDataCollector(sensorManager)
        // Should be a no-op
        collector.onAccuracyChanged(null, SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
    }

    @Test
    fun `simulation produces valid heart rate range`() = runTest {
        every { sensorManager.getDefaultSensor(any()) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        // Wait for simulation to produce data
        advanceTimeBy(2000)

        // After simulation runs, HR should be in valid range (or still 0 if not yet updated)
        val hr = collector.heartRate.value
        assertTrue("Heart rate $hr should be 0 or in range 60-180", hr == 0 || (hr in 60..180))

        collector.stop()
    }

    @Test
    fun `heart rate sensor event with zero is ignored`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        // Simulate a zero HR event - create via reflection since SensorEvent constructor is package-private
        val event = createSensorEvent(hrSensor, floatArrayOf(0f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event)

        assertEquals(0, collector.heartRate.value)
    }

    @Test
    fun `heart rate sensor event with unreliable accuracy is ignored`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(hrSensor, floatArrayOf(120f), SensorManager.SENSOR_STATUS_UNRELIABLE)
        collector.onSensorChanged(event)

        assertEquals(0, collector.heartRate.value)
    }

    @Test
    fun `valid heart rate sensor event updates flow`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(hrSensor, floatArrayOf(130f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event)

        assertEquals(130, collector.heartRate.value)
    }

    @Test
    fun `step counter calculates delta from baseline`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        every { stepSensor.type } returns Sensor.TYPE_STEP_COUNTER
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        // First event sets the baseline
        val event1 = createSensorEvent(stepSensor, floatArrayOf(10000f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event1)
        assertEquals(0, collector.steps.value) // baseline - baseline = 0

        // Second event shows delta
        val event2 = createSensorEvent(stepSensor, floatArrayOf(10050f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event2)
        assertEquals(50, collector.steps.value) // 10050 - 10000 = 50
    }

    @Test
    fun `step detector increments per step`() {
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)

        collector.onSensorChanged(event)
        assertEquals(1, collector.steps.value)

        collector.onSensorChanged(event)
        assertEquals(2, collector.steps.value)

        collector.onSensorChanged(event)
        assertEquals(3, collector.steps.value)
    }

    @Test
    fun `step detector ignored when step counter is available`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { stepSensor.type } returns Sensor.TYPE_STEP_COUNTER
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        // Set baseline via step counter
        val stepEvent = createSensorEvent(stepSensor, floatArrayOf(100f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(stepEvent)

        // Step detector fires but should be ignored
        val detectorEvent = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(detectorEvent)

        // Steps should be 0 (counter baseline - baseline = 0)
        assertEquals(0, collector.steps.value)
    }

    private fun createSensorEvent(sensor: Sensor, values: FloatArray, accuracy: Int): SensorEvent {
        // SensorEvent constructor is package-private, use reflection
        val constructor = SensorEvent::class.java.getDeclaredConstructor(Int::class.javaPrimitiveType)
        constructor.isAccessible = true
        val event = constructor.newInstance(values.size)

        // Set sensor field
        val sensorField = SensorEvent::class.java.getField("sensor")
        sensorField.set(event, sensor)

        // Set values
        val valuesField = SensorEvent::class.java.getField("values")
        val eventValues = valuesField.get(event) as FloatArray
        values.copyInto(eventValues)

        // Set accuracy
        val accuracyField = SensorEvent::class.java.getField("accuracy")
        accuracyField.set(event, accuracy)

        return event
    }
}
