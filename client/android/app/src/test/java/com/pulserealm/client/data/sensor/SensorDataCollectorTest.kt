package com.pulserealm.client.data.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorManager
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
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

    // --- Initial state ---

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

    // --- Sensor registration ---

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
    fun `start with all sensors registers all listeners`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        val stepSensor = mockk<Sensor>(relaxed = true)
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        assertTrue(collector.sensorsAvailable.value)
        verify { sensorManager.registerListener(collector, hrSensor, SensorManager.SENSOR_DELAY_NORMAL, 0) }
        verify { sensorManager.registerListener(collector, stepSensor, SensorManager.SENSOR_DELAY_FASTEST, 0) }
        verify { sensorManager.registerListener(collector, detectorSensor, SensorManager.SENSOR_DELAY_FASTEST, 0) }
    }

    // --- Idempotency ---

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
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()
        collector.stop()
        collector.start()

        assertTrue(collector.sensorsAvailable.value)
        // Should have registered twice (once per start)
        verify(exactly = 2) { sensorManager.registerListener(collector, hrSensor, SensorManager.SENSOR_DELAY_NORMAL, 0) }
    }

    @Test
    fun `onAccuracyChanged does not throw`() {
        collector = SensorDataCollector(sensorManager)
        collector.onAccuracyChanged(null, SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
    }

    // --- Heart rate events ---

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
    fun `heart rate sensor event with zero is ignored`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

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

        // First set a valid value
        val validEvent = createSensorEvent(hrSensor, floatArrayOf(120f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(validEvent)
        assertEquals(120, collector.heartRate.value)

        // Now send unreliable event — should be ignored
        val unreliableEvent = createSensorEvent(hrSensor, floatArrayOf(200f), SensorManager.SENSOR_STATUS_UNRELIABLE)
        collector.onSensorChanged(unreliableEvent)

        assertEquals(120, collector.heartRate.value) // Should still be 120
    }

    @Test
    fun `multiple heart rate events update to latest valid value`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        collector.onSensorChanged(createSensorEvent(hrSensor, floatArrayOf(80f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(80, collector.heartRate.value)

        collector.onSensorChanged(createSensorEvent(hrSensor, floatArrayOf(120f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(120, collector.heartRate.value)

        collector.onSensorChanged(createSensorEvent(hrSensor, floatArrayOf(95f), SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM))
        assertEquals(95, collector.heartRate.value)
    }

    // --- Step counter ---

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
    fun `step counter baseline resets after stop and start`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        every { stepSensor.type } returns Sensor.TYPE_STEP_COUNTER
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(5000f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(5020f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(20, collector.steps.value)

        collector.stop()
        collector.start()

        // After restart, new baseline
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(5030f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(0, collector.steps.value) // New baseline
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(5040f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(10, collector.steps.value) // Delta from new baseline
    }

    // --- Step detector ---

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

        // Step detector fires but should be ignored for step count
        val detectorEvent = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(detectorEvent)

        assertEquals(0, collector.steps.value)
    }

    @Test
    fun `step detector count resets after stop`() {
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event)
        collector.onSensorChanged(event)
        assertEquals(2, collector.steps.value)

        collector.stop()
        collector.start()

        // After restart, detector count should be 0
        collector.onSensorChanged(event)
        assertEquals(1, collector.steps.value)
    }

    // --- resetSteps ---

    @Test
    fun `resetSteps resets steps to zero`() {
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event)
        collector.onSensorChanged(event)
        collector.onSensorChanged(event)
        assertEquals(3, collector.steps.value)

        collector.resetSteps()
        assertEquals(0, collector.steps.value)
    }

    @Test
    fun `resetSteps resets step counter baseline`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        every { stepSensor.type } returns Sensor.TYPE_STEP_COUNTER
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns null

        collector = SensorDataCollector(sensorManager)
        collector.start()

        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(1000f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(1050f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(50, collector.steps.value)

        collector.resetSteps()
        assertEquals(0, collector.steps.value)

        // Next event should set new baseline
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(1060f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(0, collector.steps.value) // New baseline
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(1070f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(10, collector.steps.value)
    }

    @Test
    fun `resetSteps on fresh collector does not throw`() {
        collector = SensorDataCollector(sensorManager)
        collector.resetSteps()
        assertEquals(0, collector.steps.value)
    }

    @Test
    fun `resetSteps resets detector step count`() {
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val event = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(event)
        collector.onSensorChanged(event)
        assertEquals(2, collector.steps.value)

        collector.resetSteps()
        assertEquals(0, collector.steps.value)

        // Steps after reset start from 0 again
        collector.onSensorChanged(event)
        assertEquals(1, collector.steps.value)
    }

    // --- Heart rate does not reset steps ---

    @Test
    fun `heart rate event does not affect steps`() {
        val hrSensor = mockk<Sensor>(relaxed = true)
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { hrSensor.type } returns Sensor.TYPE_HEART_RATE
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns hrSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        val stepEvent = createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(stepEvent)
        collector.onSensorChanged(stepEvent)
        assertEquals(2, collector.steps.value)

        val hrEvent = createSensorEvent(hrSensor, floatArrayOf(130f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH)
        collector.onSensorChanged(hrEvent)
        assertEquals(130, collector.heartRate.value)
        assertEquals(2, collector.steps.value) // steps unchanged
    }

    // --- Step counter: step counter with detector present ---

    @Test
    fun `step counter is used for steps when both counter and detector are present`() {
        val stepSensor = mockk<Sensor>(relaxed = true)
        val detectorSensor = mockk<Sensor>(relaxed = true)
        every { stepSensor.type } returns Sensor.TYPE_STEP_COUNTER
        every { detectorSensor.type } returns Sensor.TYPE_STEP_DETECTOR
        every { sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE) } returns null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) } returns stepSensor
        every { sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) } returns detectorSensor

        collector = SensorDataCollector(sensorManager)
        collector.start()

        // Step counter sets baseline
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(500f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(0, collector.steps.value) // baseline

        // Step counter provides delta
        collector.onSensorChanged(createSensorEvent(stepSensor, floatArrayOf(510f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(10, collector.steps.value)

        // Step detector fires but does NOT change steps since counter is primary
        collector.onSensorChanged(createSensorEvent(detectorSensor, floatArrayOf(1f), SensorManager.SENSOR_STATUS_ACCURACY_HIGH))
        assertEquals(10, collector.steps.value) // Unchanged
    }

    /**
     * Creates a SensorEvent via reflection since its constructor is package-private.
     * This is the standard Android testing pattern for sensor events.
     */
    private fun createSensorEvent(sensor: Sensor, values: FloatArray, accuracy: Int): SensorEvent {
        val constructor = SensorEvent::class.java.getDeclaredConstructor(Int::class.javaPrimitiveType)
        constructor.isAccessible = true
        val event = constructor.newInstance(values.size)

        val sensorField = SensorEvent::class.java.getField("sensor")
        sensorField.set(event, sensor)

        val valuesField = SensorEvent::class.java.getField("values")
        val eventValues = valuesField.get(event) as FloatArray
        values.copyInto(eventValues)

        val accuracyField = SensorEvent::class.java.getField("accuracy")
        accuracyField.set(event, accuracy)

        return event
    }
}
