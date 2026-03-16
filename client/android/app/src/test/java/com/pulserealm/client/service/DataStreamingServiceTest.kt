package com.pulserealm.client.service

import org.junit.Assert.*
import org.junit.Test

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
    fun `sendCount initial value is 0`() {
        assertEquals(0, DataStreamingService.sendCount.value)
    }

    @Test
    fun `sendCount is a StateFlow`() {
        // Verify it's accessible and emits a value
        val count = DataStreamingService.sendCount.value
        assertTrue(count >= 0)
    }
}
