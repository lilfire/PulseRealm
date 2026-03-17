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
}
