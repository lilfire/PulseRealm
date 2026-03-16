package com.pulserealm.client.data.network

import com.pulserealm.client.data.model.WearableData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var client: SignalRClient

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient()
    }

    @After
    fun tearDown() {
        client.dispose()
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state is disconnected`() {
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `initial error is null`() {
        assertNull(client.error.value)
    }

    @Test
    fun `initial realmEnded is null`() {
        assertNull(client.realmEnded.value)
    }

    @Test
    fun `initial eliminated is false`() {
        assertFalse(client.eliminated.value)
    }

    @Test
    fun `isConnected returns false when disconnected`() {
        assertFalse(client.isConnected())
    }

    @Test
    fun `clearError resets error to null`() {
        // Manually set error via reflection for testing
        val errorField = SignalRClient::class.java.getDeclaredField("_error")
        errorField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val errorFlow = errorField.get(client) as kotlinx.coroutines.flow.MutableStateFlow<String?>
        errorFlow.value = "test error"

        assertEquals("test error", client.error.value)
        client.clearError()
        assertNull(client.error.value)
    }

    @Test
    fun `disconnect resets all state`() {
        client.disconnect()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertNull(client.realmEnded.value)
        assertFalse(client.eliminated.value)
        assertFalse(client.isConnected())
    }

    @Test
    fun `disconnect is idempotent`() {
        client.disconnect()
        client.disconnect()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `sendWearableData does nothing when disconnected`() {
        val data = WearableData(
            clientId = "test-client",
            heartRate = 120,
            steps = 500,
            timestamp = "2026-01-01T00:00:00Z"
        )

        // Should not throw
        client.sendWearableData("realm-123", data)
        assertNull(client.error.value)
    }

    @Test
    fun `dispose cancels reconnect scope`() {
        client.dispose()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `connectionState flow emits initial value`() {
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionStateTest {

    @Test
    fun `ConnectionState enum has all expected values`() {
        val states = ConnectionState.values()
        assertEquals(4, states.size)
        assertTrue(states.contains(ConnectionState.DISCONNECTED))
        assertTrue(states.contains(ConnectionState.CONNECTING))
        assertTrue(states.contains(ConnectionState.CONNECTED))
        assertTrue(states.contains(ConnectionState.RECONNECTING))
    }
}

class ClientSummaryDataTest {

    @Test
    fun `default values are correct`() {
        val data = ClientSummaryData()
        assertEquals("", data.clientId)
        assertEquals("", data.name)
        assertEquals(0, data.steps)
        assertEquals(0.0, data.distanceMeters, 0.001)
        assertEquals(0, data.averageHeartRate)
        assertEquals(0, data.maxHeartRate)
        assertEquals(0, data.avgCadenceSpm)
        assertTrue(data.timeInZone.isEmpty())
        assertNull(data.teamName)
        assertNull(data.teamColor)
    }

    @Test
    fun `data class copy works correctly`() {
        val original = ClientSummaryData(clientId = "c1", name = "Alice", steps = 1000)
        val modified = original.copy(steps = 2000)

        assertEquals("c1", modified.clientId)
        assertEquals("Alice", modified.name)
        assertEquals(2000, modified.steps)
    }

    @Test
    fun `equality works correctly`() {
        val a = ClientSummaryData(clientId = "c1", name = "Alice")
        val b = ClientSummaryData(clientId = "c1", name = "Alice")
        assertEquals(a, b)
    }

    @Test
    fun `inequality works correctly`() {
        val a = ClientSummaryData(clientId = "c1")
        val b = ClientSummaryData(clientId = "c2")
        assertNotEquals(a, b)
    }

    @Test
    fun `timeInZone map values are accessible`() {
        val data = ClientSummaryData(
            timeInZone = mapOf("1" to 60, "2" to 120, "3" to 30)
        )
        assertEquals(60, data.timeInZone["1"])
        assertEquals(120, data.timeInZone["2"])
        assertEquals(30, data.timeInZone["3"])
        assertNull(data.timeInZone["4"])
    }

    @Test
    fun `team fields can be set`() {
        val data = ClientSummaryData(teamName = "Red Team", teamColor = "#FF0000")
        assertEquals("Red Team", data.teamName)
        assertEquals("#FF0000", data.teamColor)
    }
}

class RealmSummaryDataTest {

    @Test
    fun `default values are correct`() {
        val data = RealmSummaryData()
        assertEquals(0.0, data.durationSeconds, 0.001)
        assertEquals(0.0, data.totalDistanceMeters, 0.001)
        assertEquals(0, data.totalSteps)
        assertEquals(0, data.averageHeartRate)
        assertEquals(0, data.maxHeartRate)
        assertEquals(0.0, data.averageSpeedKmh, 0.001)
        assertEquals(0, data.avgCadenceSpm)
        assertTrue(data.timeInZone.isEmpty())
        assertEquals(0.0, data.activePeriodSeconds, 0.001)
        assertEquals(0, data.participantCount)
        assertFalse(data.isTeamFormat)
        assertTrue(data.clientSummaries.isEmpty())
    }

    @Test
    fun `data class with full values`() {
        val summaries = listOf(
            ClientSummaryData(clientId = "c1", name = "Alice", steps = 1000),
            ClientSummaryData(clientId = "c2", name = "Bob", steps = 800)
        )
        val data = RealmSummaryData(
            durationSeconds = 300.0,
            totalDistanceMeters = 1500.0,
            totalSteps = 1800,
            averageHeartRate = 140,
            maxHeartRate = 175,
            averageSpeedKmh = 8.5,
            avgCadenceSpm = 160,
            timeInZone = mapOf("1" to 60, "2" to 120, "3" to 90, "4" to 30),
            activePeriodSeconds = 280.0,
            participantCount = 2,
            isTeamFormat = true,
            clientSummaries = summaries
        )

        assertEquals(300.0, data.durationSeconds, 0.001)
        assertEquals(1500.0, data.totalDistanceMeters, 0.001)
        assertEquals(1800, data.totalSteps)
        assertEquals(140, data.averageHeartRate)
        assertEquals(175, data.maxHeartRate)
        assertEquals(8.5, data.averageSpeedKmh, 0.001)
        assertEquals(160, data.avgCadenceSpm)
        assertEquals(4, data.timeInZone.size)
        assertEquals(280.0, data.activePeriodSeconds, 0.001)
        assertEquals(2, data.participantCount)
        assertTrue(data.isTeamFormat)
        assertEquals(2, data.clientSummaries.size)
    }

    @Test
    fun `copy preserves team format`() {
        val original = RealmSummaryData(isTeamFormat = true, participantCount = 5)
        val copy = original.copy(participantCount = 10)
        assertTrue(copy.isTeamFormat)
        assertEquals(10, copy.participantCount)
    }
}
