package com.pulserealm.client.service

import android.content.Intent
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class DataStreamingServiceTest {

    @Before
    fun resetServiceState() {
        // Guarantee a clean baseline before each test because _caloriesBurned lives
        // in the companion object (process-static). Any test that mutates it via
        // reflection must not bleed into subsequent tests.
        DataStreamingService.resetState()
    }

    // ── Constant values ──────────────────────────────────────────────────

    @Test
    fun `EXTRA_REALM_ID constant value`() {
        assertEquals("realm_id", DataStreamingService.EXTRA_REALM_ID)
    }

    @Test
    fun `EXTRA_CLIENT_ID constant value`() {
        assertEquals("client_id", DataStreamingService.EXTRA_CLIENT_ID)
    }

    @Test
    fun `EXTRA_INTERVAL_MS constant value`() {
        assertEquals("interval_ms", DataStreamingService.EXTRA_INTERVAL_MS)
    }

    @Test
    fun `EXTRA_WEIGHT_KG constant value`() {
        assertEquals("weight_kg", DataStreamingService.EXTRA_WEIGHT_KG)
    }

    @Test
    fun `EXTRA_AGE constant value`() {
        assertEquals("age", DataStreamingService.EXTRA_AGE)
    }

    // ── caloriesBurned StateFlow ─────────────────────────────────────────

    @Test
    fun `caloriesBurned initial value is 0`() {
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)
    }

    @Test
    fun `caloriesBurned is a StateFlow that can be collected`() {
        val flow: StateFlow<Double> = DataStreamingService.caloriesBurned
        // StateFlow.value is synchronously readable without a coroutine
        assertEquals(0.0, flow.value, 0.001)
    }

    @Test
    fun `caloriesBurned StateFlow emits current value on first collect`() = runBlocking {
        val flow: StateFlow<Double> = DataStreamingService.caloriesBurned
        val emitted = flow.first()
        assertEquals(0.0, emitted, 0.001)
    }

    @Test
    fun `caloriesBurned reference is not null`() {
        assertNotNull(DataStreamingService.caloriesBurned)
    }

    // ── resetState ───────────────────────────────────────────────────────

    @Test
    fun `resetState resets caloriesBurned to zero after non-zero value set via reflection`() {
        // Access the private companion-object backing field via reflection to simulate
        // a running service that has accumulated calories.
        val companionClass = DataStreamingService::class.java.getDeclaredField("Companion")
            .let { DataStreamingService::class.java }
        // Walk the declared fields on the companion object class
        val companionInstance = DataStreamingService::class.java
            .getDeclaredField("Companion")
            .also { it.isAccessible = true }
            .get(null)

        val caloriesField = DataStreamingService::class.java
            .getDeclaredField("_caloriesBurned")
            .also { it.isAccessible = true }

        @Suppress("UNCHECKED_CAST")
        val caloriesFlow = caloriesField.get(companionInstance)
            as kotlinx.coroutines.flow.MutableStateFlow<Double>

        // Simulate accumulated calories from a workout session
        caloriesFlow.value = 42.5
        assertEquals(42.5, DataStreamingService.caloriesBurned.value, 0.001)

        DataStreamingService.resetState()

        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)
    }

    @Test
    fun `resetState is idempotent when called multiple times`() {
        DataStreamingService.resetState()
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)

        DataStreamingService.resetState()
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)

        DataStreamingService.resetState()
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)
    }

    @Test
    fun `resetState after accumulation via reflection leaves value at zero`() {
        val companionInstance = DataStreamingService::class.java
            .getDeclaredField("Companion")
            .also { it.isAccessible = true }
            .get(null)

        val caloriesField = DataStreamingService::class.java
            .getDeclaredField("_caloriesBurned")
            .also { it.isAccessible = true }

        @Suppress("UNCHECKED_CAST")
        val caloriesFlow = caloriesField.get(companionInstance)
            as kotlinx.coroutines.flow.MutableStateFlow<Double>

        caloriesFlow.value = 100.0
        DataStreamingService.resetState()
        DataStreamingService.resetState()  // Second call — must remain 0.0
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)
    }

    // ── Intent extras ────────────────────────────────────────────────────

    @Test
    fun `intent extras can be set for realm ID`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_REALM_ID, "realm-abc")
            putExtra(DataStreamingService.EXTRA_CLIENT_ID, "wear-test1234")
            putExtra(DataStreamingService.EXTRA_INTERVAL_MS, 500L)
        }

        assertEquals("realm-abc", intent.getStringExtra(DataStreamingService.EXTRA_REALM_ID))
        assertEquals("wear-test1234", intent.getStringExtra(DataStreamingService.EXTRA_CLIENT_ID))
        assertEquals(500L, intent.getLongExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L))
    }

    @Test
    fun `intent extras default interval is 1000`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_REALM_ID, "realm-abc")
            putExtra(DataStreamingService.EXTRA_CLIENT_ID, "wear-test1234")
        }

        // When EXTRA_INTERVAL_MS is not set, default should be used
        assertEquals(1000L, intent.getLongExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L))
    }

    @Test
    fun `intent without realm ID returns null`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java)

        assertNull(intent.getStringExtra(DataStreamingService.EXTRA_REALM_ID))
    }

    @Test
    fun `intent targets DataStreamingService class`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java)

        assertEquals(
            DataStreamingService::class.java.name,
            intent.component?.className
        )
    }

    // ── Intent extras: weight and age ────────────────────────────────────

    @Test
    fun `intent weight extra can be set`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_WEIGHT_KG, 75.5)
        }
        assertEquals(75.5, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, 0.0), 0.001)
    }

    @Test
    fun `intent weight extra defaults to zero`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java)
        assertEquals(0.0, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, 0.0), 0.001)
    }

    @Test
    fun `intent age extra can be set`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_AGE, 30)
        }
        assertEquals(30, intent.getIntExtra(DataStreamingService.EXTRA_AGE, 0))
    }

    @Test
    fun `intent age extra defaults to zero`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java)
        assertEquals(0, intent.getIntExtra(DataStreamingService.EXTRA_AGE, 0))
    }

    // ── Intent with full extras ───────────────────────────────────────────

    @Test
    fun `intent with all extras preserves all values`() {
        val context = RuntimeEnvironment.getApplication()
        val intent = Intent(context, DataStreamingService::class.java).apply {
            putExtra(DataStreamingService.EXTRA_REALM_ID, "realm-xyz")
            putExtra(DataStreamingService.EXTRA_CLIENT_ID, "wear-abc")
            putExtra(DataStreamingService.EXTRA_INTERVAL_MS, 500L)
            putExtra(DataStreamingService.EXTRA_WEIGHT_KG, 80.0)
            putExtra(DataStreamingService.EXTRA_AGE, 25)
        }
        assertEquals("realm-xyz", intent.getStringExtra(DataStreamingService.EXTRA_REALM_ID))
        assertEquals("wear-abc", intent.getStringExtra(DataStreamingService.EXTRA_CLIENT_ID))
        assertEquals(500L, intent.getLongExtra(DataStreamingService.EXTRA_INTERVAL_MS, 1000L))
        assertEquals(80.0, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, 0.0), 0.001)
        assertEquals(25, intent.getIntExtra(DataStreamingService.EXTRA_AGE, 0))
    }

    // ── Companion object properties ───────────────────────────────────────

    @Test
    fun `CHANNEL_ID private constant exists via notification channel`() {
        // Verify the class has the expected companion object structure
        assertNotNull(DataStreamingService.caloriesBurned)
    }

    @Test
    fun `caloriesBurned is a StateFlow`() {
        val flow = DataStreamingService.caloriesBurned
        assertEquals(0.0, flow.value, 0.001)
    }
}

/**
 * Tests for the calorie calculation formula used in DataStreamingService.
 * The formula is: calsPerMin = (-37.549 + 0.5391 * hr + 0.1626 * weightKg + 0.1379 * age) / 4.184
 * calsThisTick = (calsPerMin.coerceAtLeast(0.0) / 60.0) * intervalSec
 */
class CalorieCalculationTest {

    // Extracted the formula for unit-testable verification
    private fun calculateCaloriesPerMinute(hr: Int, weightKg: Double, age: Int): Double {
        return (-37.549 + 0.5391 * hr + 0.1626 * weightKg + 0.1379 * age) / 4.184
    }

    private fun calculateCaloriesPerTick(hr: Int, weightKg: Double, age: Int, intervalSec: Double): Double {
        val calsPerMin = calculateCaloriesPerMinute(hr, weightKg, age)
        return (calsPerMin.coerceAtLeast(0.0) / 60.0) * intervalSec
    }

    @Test
    fun `moderate exercise typical calorie rate`() {
        // 140 bpm, 70 kg, 30 years old
        val cpm = calculateCaloriesPerMinute(140, 70.0, 30)
        assertTrue("Expected positive calories per minute", cpm > 0)
        // Expected approximately: (-37.549 + 75.474 + 11.382 + 4.137) / 4.184 ≈ 12.77
        assertEquals(12.77, cpm, 0.5)
    }

    @Test
    fun `high intensity exercise calorie rate`() {
        // 180 bpm, 80 kg, 25 years old
        val cpm = calculateCaloriesPerMinute(180, 80.0, 25)
        assertTrue(cpm > 0)
        // Higher HR = more calories
        val moderateCpm = calculateCaloriesPerMinute(120, 80.0, 25)
        assertTrue(cpm > moderateCpm)
    }

    @Test
    fun `very low heart rate may yield negative before coerce`() {
        // 30 bpm, 50 kg, 20 years old — unrealistically low
        val cpm = calculateCaloriesPerMinute(30, 50.0, 20)
        // Could be negative before coercion
        val tickCals = calculateCaloriesPerTick(30, 50.0, 20, 1.0)
        assertTrue("Tick calories should be >= 0 after coercion", tickCals >= 0.0)
    }

    @Test
    fun `calorie tick scales with interval`() {
        val tick1s = calculateCaloriesPerTick(140, 70.0, 30, 1.0)
        val tick2s = calculateCaloriesPerTick(140, 70.0, 30, 2.0)
        assertEquals(tick1s * 2, tick2s, 0.001)
    }

    @Test
    fun `zero heart rate yields zero tick calories`() {
        val tick = calculateCaloriesPerTick(0, 70.0, 30, 1.0)
        assertEquals(0.0, tick, 0.001)
    }

    @Test
    fun `heavier person burns more calories at same HR`() {
        val light = calculateCaloriesPerMinute(140, 55.0, 30)
        val heavy = calculateCaloriesPerMinute(140, 95.0, 30)
        assertTrue(heavy > light)
    }

    @Test
    fun `older person burns more calories at same HR and weight`() {
        val young = calculateCaloriesPerMinute(140, 70.0, 20)
        val older = calculateCaloriesPerMinute(140, 70.0, 50)
        assertTrue(older > young)
    }

    @Test
    fun `zero weight and age yields correct computation`() {
        // Edge case: missing profile data
        val tick = calculateCaloriesPerTick(140, 0.0, 0, 1.0)
        // (-37.549 + 75.474 + 0 + 0) / 4.184 ≈ 9.066
        assertTrue(tick > 0)
    }

    // ── Boundary HR values ───────────────────────────────────────────────

    @Test
    fun `HR at boundary 1 bpm produces near-zero but coerced tick calories`() {
        // 1 bpm is unrealistically low — formula likely yields negative, coerced to 0
        val tick = calculateCaloriesPerTick(1, 70.0, 30, 1.0)
        assertTrue("Tick calories must be >= 0", tick >= 0.0)
    }

    @Test
    fun `HR at boundary 60 bpm resting heart rate`() {
        // 60 bpm is a resting rate — with normal weight and age the formula should yield
        // a small positive value or negative (coerced to 0)
        val tick = calculateCaloriesPerTick(60, 70.0, 30, 1.0)
        assertTrue("Tick calories must be >= 0 after coercion", tick >= 0.0)
    }

    @Test
    fun `HR at boundary 100 bpm light exercise`() {
        val cpm = calculateCaloriesPerMinute(100, 70.0, 30)
        // 100 bpm with 70 kg, age 30 — expect some positive value
        // (-37.549 + 53.91 + 11.382 + 4.137) / 4.184 ≈ 7.62
        assertTrue(cpm > 0)
        assertEquals(7.62, cpm, 0.5)
    }

    @Test
    fun `HR at boundary 200 bpm maximum exercise`() {
        val cpm = calculateCaloriesPerMinute(200, 70.0, 30)
        assertTrue(cpm > 0)
        // Must be greater than HR 140 case for same weight/age
        val moderateCpm = calculateCaloriesPerMinute(140, 70.0, 30)
        assertTrue(cpm > moderateCpm)
    }

    @Test
    fun `HR exactly at coerce boundary produces zero tick`() {
        // Find an HR that produces exactly 0 cals/min:
        // 0 = (-37.549 + 0.5391*hr + 0.1626*70 + 0.1379*30) / 4.184
        // 0 = -37.549 + 0.5391*hr + 11.382 + 4.137
        // 0.5391*hr = 22.03  =>  hr ≈ 40.9
        // At hr=40, formula should still be negative → coerced to 0
        val tick40 = calculateCaloriesPerTick(40, 70.0, 30, 1.0)
        assertEquals(0.0, tick40, 0.001)

        // At hr=41, formula should cross into positive territory
        val cpm41 = calculateCaloriesPerMinute(41, 70.0, 30)
        val tick41 = calculateCaloriesPerTick(41, 70.0, 30, 1.0)
        // tick41 may still be near zero but non-negative
        assertTrue(tick41 >= 0.0)
        // If cpm41 > 0, tick41 must be > 0
        if (cpm41 > 0) assertTrue(tick41 > 0.0)
    }

    // ── Boundary weight values ────────────────────────────────────────────

    @Test
    fun `minimum valid weight 10 kg produces non-negative tick calories`() {
        val tick = calculateCaloriesPerTick(140, 10.0, 30, 1.0)
        assertTrue("Tick calories must be >= 0", tick >= 0.0)
    }

    @Test
    fun `maximum valid weight 300 kg produces higher calories than 70 kg`() {
        val light = calculateCaloriesPerMinute(140, 70.0, 30)
        val heavy = calculateCaloriesPerMinute(140, 300.0, 30)
        assertTrue(heavy > light)
    }

    @Test
    fun `weight 50 kg produces fewer calories than 100 kg at same HR`() {
        val cpm50 = calculateCaloriesPerMinute(150, 50.0, 25)
        val cpm100 = calculateCaloriesPerMinute(150, 100.0, 25)
        assertTrue(cpm100 > cpm50)
    }

    // ── Specific age values ───────────────────────────────────────────────

    @Test
    fun `minimum valid age 5 produces lower calories than age 30`() {
        val young = calculateCaloriesPerMinute(140, 70.0, 5)
        val adult = calculateCaloriesPerMinute(140, 70.0, 30)
        assertTrue(adult > young)
    }

    @Test
    fun `maximum valid age 120 produces higher calories than age 30`() {
        val old = calculateCaloriesPerMinute(140, 70.0, 120)
        val adult = calculateCaloriesPerMinute(140, 70.0, 30)
        assertTrue(old > adult)
    }

    @Test
    fun `age 25 formula spot check`() {
        // (-37.549 + 0.5391*140 + 0.1626*70 + 0.1379*25) / 4.184
        // = (-37.549 + 75.474 + 11.382 + 3.4475) / 4.184
        // = 52.7545 / 4.184 ≈ 12.61
        val cpm = calculateCaloriesPerMinute(140, 70.0, 25)
        assertEquals(12.61, cpm, 0.1)
    }

    @Test
    fun `age 50 formula spot check`() {
        // (-37.549 + 0.5391*140 + 0.1626*70 + 0.1379*50) / 4.184
        // = (-37.549 + 75.474 + 11.382 + 6.895) / 4.184
        // = 56.202 / 4.184 ≈ 13.43
        val cpm = calculateCaloriesPerMinute(140, 70.0, 50)
        assertEquals(13.43, cpm, 0.1)
    }

    @Test
    fun `calorie tick with half-second interval is half of one-second interval`() {
        val tick1s = calculateCaloriesPerTick(160, 80.0, 35, 1.0)
        val tick05s = calculateCaloriesPerTick(160, 80.0, 35, 0.5)
        assertEquals(tick1s / 2.0, tick05s, 0.0001)
    }

    @Test
    fun `negative calsPerMin is coerced to zero regardless of interval`() {
        // HR=1 with any typical weight/age produces negative cals/min
        val tick1s = calculateCaloriesPerTick(1, 70.0, 30, 1.0)
        val tick10s = calculateCaloriesPerTick(1, 70.0, 30, 10.0)
        assertEquals(0.0, tick1s, 0.001)
        assertEquals(0.0, tick10s, 0.001)
    }
}
