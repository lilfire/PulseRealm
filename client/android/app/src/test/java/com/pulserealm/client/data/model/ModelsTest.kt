package com.pulserealm.client.data.model

import org.junit.Assert.*
import org.junit.Test

class WearableDataTest {

    @Test
    fun `data class properties are accessible`() {
        val data = WearableData(
            clientId = "client-123",
            heartRate = 140,
            steps = 500,
            timestamp = "2026-01-01T12:00:00Z"
        )

        assertEquals("client-123", data.clientId)
        assertEquals(140, data.heartRate)
        assertEquals(500, data.steps)
        assertEquals("2026-01-01T12:00:00Z", data.timestamp)
    }

    @Test
    fun `equality works correctly`() {
        val a = WearableData("c1", 120, 100, "2026-01-01T00:00:00Z")
        val b = WearableData("c1", 120, 100, "2026-01-01T00:00:00Z")
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }

    @Test
    fun `inequality works correctly`() {
        val a = WearableData("c1", 120, 100, "2026-01-01T00:00:00Z")
        val b = WearableData("c1", 130, 100, "2026-01-01T00:00:00Z")
        assertNotEquals(a, b)
    }

    @Test
    fun `copy modifies specified fields`() {
        val original = WearableData("c1", 120, 100, "2026-01-01T00:00:00Z")
        val modified = original.copy(heartRate = 150, steps = 200)

        assertEquals("c1", modified.clientId)
        assertEquals(150, modified.heartRate)
        assertEquals(200, modified.steps)
        assertEquals("2026-01-01T00:00:00Z", modified.timestamp)
    }

    @Test
    fun `toString contains all fields`() {
        val data = WearableData("c1", 120, 100, "ts")
        val str = data.toString()
        assertTrue(str.contains("c1"))
        assertTrue(str.contains("120"))
        assertTrue(str.contains("100"))
        assertTrue(str.contains("ts"))
    }

    @Test
    fun `destructuring works`() {
        val data = WearableData("c1", 120, 100, "ts")
        val (clientId, heartRate, steps, timestamp) = data
        assertEquals("c1", clientId)
        assertEquals(120, heartRate)
        assertEquals(100, steps)
        assertEquals("ts", timestamp)
    }

    @Test
    fun `zero values are valid`() {
        val data = WearableData("c1", 0, 0, "")
        assertEquals(0, data.heartRate)
        assertEquals(0, data.steps)
    }

    @Test
    fun `high values are valid`() {
        val data = WearableData("c1", 220, 100000, "ts")
        assertEquals(220, data.heartRate)
        assertEquals(100000, data.steps)
    }
}

class RealmInfoTest {

    @Test
    fun `data class properties are accessible`() {
        val info = RealmInfo(
            id = "realm-abc",
            joinCode = "123456",
            mode = "competition",
            status = "Lobby"
        )

        assertEquals("realm-abc", info.id)
        assertEquals("123456", info.joinCode)
        assertEquals("competition", info.mode)
        assertEquals("Lobby", info.status)
    }

    @Test
    fun `equality works correctly`() {
        val a = RealmInfo("r1", "123456", "social", "Lobby")
        val b = RealmInfo("r1", "123456", "social", "Lobby")
        assertEquals(a, b)
    }

    @Test
    fun `inequality on different ids`() {
        val a = RealmInfo("r1", "123456", "social", "Lobby")
        val b = RealmInfo("r2", "123456", "social", "Lobby")
        assertNotEquals(a, b)
    }

    @Test
    fun `copy modifies specified fields`() {
        val original = RealmInfo("r1", "123456", "social", "Lobby")
        val modified = original.copy(mode = "dungeon", status = "Started")

        assertEquals("r1", modified.id)
        assertEquals("123456", modified.joinCode)
        assertEquals("dungeon", modified.mode)
        assertEquals("Started", modified.status)
    }

    @Test
    fun `status defaults to null`() {
        val info = RealmInfo("r1", "123456", "social")
        assertNull(info.status)
    }

    @Test
    fun `all realm modes are valid strings`() {
        val modes = listOf("competition", "streetview", "youtubetrail", "route", "dungeon", "social")
        for (mode in modes) {
            val info = RealmInfo("r1", "123456", mode)
            assertEquals(mode, info.mode)
        }
    }

    @Test
    fun `destructuring works`() {
        val info = RealmInfo("r1", "123456", "social", "Lobby")
        val (id, joinCode, mode, status) = info
        assertEquals("r1", id)
        assertEquals("123456", joinCode)
        assertEquals("social", mode)
        assertEquals("Lobby", status)
    }
}
