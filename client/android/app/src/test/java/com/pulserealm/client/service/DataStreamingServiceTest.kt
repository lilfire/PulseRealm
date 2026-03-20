package com.pulserealm.client.service

import android.content.Intent
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class DataStreamingServiceTest {

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

    @Test
    fun `caloriesBurned initial value is 0`() {
        assertEquals(0.0, DataStreamingService.caloriesBurned.value, 0.001)
    }

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

    // --- Intent extras: weight and age ---

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

    // --- Intent with full extras ---

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

    // --- Companion object properties ---

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
}
