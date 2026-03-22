package com.pulserealm.client.data.network

import com.microsoft.signalr.HubConnection
import com.microsoft.signalr.HttpHubConnectionBuilder
import com.microsoft.signalr.HubConnectionBuilder
import com.microsoft.signalr.HubConnectionState
import com.pulserealm.client.data.model.WearableData
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
import io.mockk.verify
import io.reactivex.rxjava3.core.Completable
import io.reactivex.rxjava3.core.Single
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

// TODO: Several tests in this class use reflection to access private MutableStateFlow fields
//  (e.g. _error, _bindRequest, _realmStarted). This is a test smell — it couples tests to
//  implementation details and will break if fields are renamed. The preferred fix would be
//  to expose test-only factory methods or use a fake/stub for SignalRClient, but that would
//  require significant refactoring of the class and its callers. Left as-is for now.
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = false
        )
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
        // Use sendWearableData to attempt sending on a null hub — triggers no error
        // because the early return guard fires. Instead, verify clearError works
        // after manually setting error state (common test pattern for private state).
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
    fun `clearError is idempotent when already null`() {
        assertNull(client.error.value)
        client.clearError()
        assertNull(client.error.value)
    }

    @Test
    fun `disconnect resets all state`() = runTest(testDispatcher) {
        client.disconnect()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertNull(client.realmEnded.value)
        assertFalse(client.eliminated.value)
        assertFalse(client.isConnected())
    }

    @Test
    fun `disconnect is idempotent`() = runTest(testDispatcher) {
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

        // Should not throw — early return since not connected
        client.sendWearableData("realm-123", data)
        assertNull(client.error.value)
    }

    @Test
    fun `sendWearableData with various data does not crash when disconnected`() {
        val data1 = WearableData("c1", 0, 0, "")
        val data2 = WearableData("c2", 220, 100000, "2026-01-01T00:00:00Z")

        client.sendWearableData("realm-1", data1)
        client.sendWearableData("realm-2", data2)

        assertNull(client.error.value)
    }

    @Test
    fun `dispose cancels reconnect scope and disconnects`() {
        client.dispose()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertFalse(client.isConnected())
    }

    @Test
    fun `dispose then disconnect does not throw`() = runTest(testDispatcher) {
        client.dispose()
        client.disconnect()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `connectionState flow emits initial value`() {
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `error flow emits initial null`() {
        assertNull(client.error.value)
    }

    @Test
    fun `realmEnded flow emits initial null`() {
        assertNull(client.realmEnded.value)
    }

    @Test
    fun `eliminated flow emits initial false`() {
        assertFalse(client.eliminated.value)
    }

    @Test
    fun `constructor accepts custom scope`() {
        val customScope = CoroutineScope(testDispatcher + SupervisorJob())
        val customClient = SignalRClient(reconnectScope = customScope)

        assertEquals(ConnectionState.DISCONNECTED, customClient.connectionState.value)
        customClient.dispose()
    }

    // --- respondBind ---

    @Test
    fun `respondBind clears bindRequest`() {
        // Manually set bindRequest
        val bindField = SignalRClient::class.java.getDeclaredField("_bindRequest")
        bindField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val bindFlow = bindField.get(client) as kotlinx.coroutines.flow.MutableStateFlow<BindRequestData?>
        bindFlow.value = BindRequestData(code = "123456")

        assertEquals("123456", client.bindRequest.value?.code)
        client.respondBind("realm-1", true)
        assertNull(client.bindRequest.value)
    }

    @Test
    fun `respondBind with no hub does not throw`() {
        client.respondBind("realm-1", false)
        assertNull(client.bindRequest.value)
    }

    // --- leaveRealm ---

    @Test
    fun `leaveRealm without hub returns false and disconnects`() = runTest(testDispatcher) {
        val result = client.leaveRealm()
        assertFalse(result)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `leaveRealm resets state`() = runTest(testDispatcher) {
        client.leaveRealm()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertFalse(client.isConnected())
    }

    // --- onNetworkAvailable ---

    @Test
    fun `onNetworkAvailable does nothing after intentional disconnect`() = runTest(testDispatcher) {
        client.disconnect() // sets intentionalDisconnect = true
        client.onNetworkAvailable()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `onNetworkAvailable does nothing when no joinCode`() {
        // Fresh client has no joinCode
        client.onNetworkAvailable()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    // --- initial realmStarted ---

    @Test
    fun `initial realmStarted is false`() {
        assertFalse(client.realmStarted.value)
    }

    // --- initial bindRequest ---

    @Test
    fun `initial bindRequest is null`() {
        assertNull(client.bindRequest.value)
    }

    // --- disconnect clears extended state ---

    @Test
    fun `disconnect resets realmStarted`() = runTest(testDispatcher) {
        val field = SignalRClient::class.java.getDeclaredField("_realmStarted")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(client) as kotlinx.coroutines.flow.MutableStateFlow<Boolean>
        flow.value = true

        client.disconnect()
        assertFalse(client.realmStarted.value)
    }

    @Test
    fun `disconnect resets bindRequest`() = runTest(testDispatcher) {
        val field = SignalRClient::class.java.getDeclaredField("_bindRequest")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(client) as kotlinx.coroutines.flow.MutableStateFlow<BindRequestData?>
        flow.value = BindRequestData(code = "ABC")

        client.disconnect()
        assertNull(client.bindRequest.value)
    }

    // --- sendWearableData edge cases ---

    @Test
    fun `sendWearableData with high heart rate does not crash when disconnected`() {
        val data = WearableData("c1", 250, 0, "")
        client.sendWearableData("realm-1", data)
        // No exception means success
    }

    @Test
    fun `sendWearableData with negative steps does not crash when disconnected`() {
        val data = WearableData("c1", 0, -100, "")
        client.sendWearableData("realm-1", data)
    }

    // --- Multiple dispose calls ---

    @Test
    fun `multiple dispose calls do not throw`() {
        client.dispose()
        client.dispose()
        client.dispose()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    // --- State after leaveRealm ---

    @Test
    fun `leaveRealm clears realmEnded`() = runTest(testDispatcher) {
        val field = SignalRClient::class.java.getDeclaredField("_realmEnded")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(client) as kotlinx.coroutines.flow.MutableStateFlow<RealmSummaryData?>
        flow.value = RealmSummaryData(durationSeconds = 100.0)

        client.leaveRealm()
        // After leaveRealm disconnects internally, state is reset
        assertNull(client.realmEnded.value)
    }

    @Test
    fun `leaveRealm clears eliminated`() = runTest(testDispatcher) {
        val field = SignalRClient::class.java.getDeclaredField("_eliminated")
        field.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val flow = field.get(client) as kotlinx.coroutines.flow.MutableStateFlow<Boolean>
        flow.value = true

        client.leaveRealm()
        assertFalse(client.eliminated.value)
    }
}

/**
 * Tests for SignalRClient with mocked HubConnection — covers connect(), joinRealm(),
 * sendWearableData when connected, leaveRealm with hub, and hub handler callbacks.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientHubTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient
    private lateinit var mockHub: HubConnection
    private lateinit var mockBuilder: HttpHubConnectionBuilder

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = false
        )

        mockHub = mockk(relaxed = true)
        mockBuilder = mockk(relaxed = true)

        every { mockHub.start() } returns Completable.complete()
        every { mockHub.stop() } returns Completable.complete()
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED

        mockkStatic(HubConnectionBuilder::class)
        every { HubConnectionBuilder.create(any<String>()) } returns mockBuilder
        every { mockBuilder.shouldSkipNegotiate(any<Boolean>()) } returns mockBuilder
        every { mockBuilder.build() } returns mockHub
    }

    @After
    fun tearDown() {
        client.dispose()
        unmockkStatic(HubConnectionBuilder::class)
        Dispatchers.resetMain()
    }

    // --- connect() ---

    @Test
    fun `connect transitions to CONNECTED on success`() = runTest(testDispatcher) {
        client.connect("http://192.168.1.10:5062")

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        assertNull(client.error.value)
        assertTrue(client.isConnected())
    }

    @Test
    fun `connect builds URL with hub path`() = runTest(testDispatcher) {
        client.connect("http://192.168.1.10:5062")

        verify { HubConnectionBuilder.create("http://192.168.1.10:5062/hubs/realm") }
    }

    @Test
    fun `connect trims trailing slash`() = runTest(testDispatcher) {
        client.connect("http://192.168.1.10:5062/")

        verify { HubConnectionBuilder.create("http://192.168.1.10:5062/hubs/realm") }
    }

    @Test
    fun `connect sets error on failure`() = runTest(testDispatcher) {
        every { mockHub.start() } returns Completable.error(RuntimeException("Connection refused"))

        client.connect("http://192.168.1.10:5062")

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertNotNull(client.error.value)
    }

    @Test
    fun `connect registers hub handlers`() = runTest(testDispatcher) {
        client.connect("http://192.168.1.10:5062")

        // Verify hub handlers were registered
        verify { mockHub.on(eq("RealmStarted"), any<com.microsoft.signalr.Action1<Any>>(), eq(Any::class.java)) }
        verify { mockHub.on(eq("ClientEliminated"), any<com.microsoft.signalr.Action1<String>>(), eq(String::class.java)) }
        verify { mockHub.on(eq("RealmEnded"), any<com.microsoft.signalr.Action1<Any>>(), eq(Any::class.java)) }
        verify { mockHub.on(eq("BindRequest"), any<com.microsoft.signalr.Action1<String>>(), eq(String::class.java)) }
        verify { mockHub.on(eq("BindCancelled"), any<com.microsoft.signalr.Action>()) }
        verify { mockHub.on(eq("YouWereKicked"), any<com.microsoft.signalr.Action>()) }
        verify { mockHub.on(eq("Error"), any<com.microsoft.signalr.Action1<String>>(), eq(String::class.java)) }
        verify { mockHub.onClosed(any()) }
    }

    @Test
    fun `second connect disconnects first`() = runTest(testDispatcher) {
        client.connect("http://server1:5062")

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)

        // Second connect should stop first connection
        client.connect("http://server2:5062")

        verify { mockHub.stop() }
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    // --- joinRealm() ---

    @Test
    fun `joinRealm invokes hub method`() = runTest(testDispatcher) {
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm("123456", "client-1")

        verify { mockHub.invoke(eq("JoinRealm"), eq("123456"), eq("client-1"), any()) }
    }

    @Test
    fun `joinRealm with profile sends profile data`() = runTest(testDispatcher) {
        val profileSlot = slot<HashMap<String, Any>>()
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), capture(profileSlot)) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm(
            joinCode = "123456",
            clientId = "client-1",
            name = "Alice",
            age = 30,
            heightCm = 170.0,
            weightKg = 65.0,
            strideFactor = 0.415
        )

        assertTrue(profileSlot.isCaptured)
        val profile = profileSlot.captured
        assertEquals("Alice", profile["name"])
        assertEquals(30, profile["age"])
        assertEquals(170.0, profile["heightCm"])
        assertEquals(65.0, profile["weightKg"])
    }

    @Test
    fun `joinRealm without profile sends null`() = runTest(testDispatcher) {
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm("123456", "client-1")

        verify { mockHub.invoke("JoinRealm", "123456", "client-1", null) }
    }

    @Test
    fun `joinRealm sets error on failure`() = runTest(testDispatcher) {
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.error(
            RuntimeException("Realm not found")
        )

        client.connect("http://server:5062")

        try {
            client.joinRealm("999999", "client-1")
        } catch (_: Exception) { }

        assertNotNull(client.error.value)
    }

    @Test
    fun `joinRealm with zone bounds includes them in profile`() = runTest(testDispatcher) {
        val profileSlot = slot<HashMap<String, Any>>()
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), capture(profileSlot)) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm(
            joinCode = "123456",
            clientId = "client-1",
            name = "Bob",
            age = 25,
            heightCm = 180.0,
            weightKg = 80.0,
            zoneBounds = doubleArrayOf(100.0, 120.0, 140.0, 160.0),
            maxHr = 190
        )

        assertTrue(profileSlot.isCaptured)
        val profile = profileSlot.captured
        assertNotNull(profile["zoneBounds"])
        assertEquals(190, profile["maxHr"])
    }

    // --- sendWearableData when connected ---

    @Test
    fun `sendWearableData sends data map when connected`() = runTest(testDispatcher) {
        client.connect("http://server:5062")

        val data = WearableData("client-1", 140, 500, "2026-01-01T00:00:00Z")
        client.sendWearableData("realm-abc", data)

        verify { mockHub.send(eq("SendWearableData"), eq("realm-abc"), any<HashMap<String, Any>>()) }
    }

    @Test
    fun `sendWearableData skips when hub not connected`() = runTest(testDispatcher) {
        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        client.connect("http://server:5062")

        val data = WearableData("client-1", 140, 500, "2026-01-01T00:00:00Z")
        client.sendWearableData("realm-abc", data)

        verify(exactly = 0) { mockHub.send(any(), any(), any<HashMap<String, Any>>()) }
    }

    // --- leaveRealm with hub ---

    @Test
    fun `leaveRealm returns true when server returns summary`() = runTest(testDispatcher) {
        every { mockHub.invoke(Boolean::class.java, "LeaveRealm") } returns Single.just(true)

        client.connect("http://server:5062")

        val result = client.leaveRealm()
        assertTrue(result)
    }

    @Test
    fun `leaveRealm returns false and disconnects when no summary`() = runTest(testDispatcher) {
        every { mockHub.invoke(Boolean::class.java, "LeaveRealm") } returns Single.just(false)

        client.connect("http://server:5062")

        val result = client.leaveRealm()
        assertFalse(result)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `leaveRealm handles exception gracefully`() = runTest(testDispatcher) {
        every { mockHub.invoke(Boolean::class.java, "LeaveRealm") } returns Single.error(RuntimeException("error"))

        client.connect("http://server:5062")

        val result = client.leaveRealm()
        assertFalse(result)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    // --- respondBind with hub ---

    @Test
    fun `respondBind sends to hub when connected`() = runTest(testDispatcher) {
        client.connect("http://server:5062")

        client.respondBind("realm-1", true)
        verify { mockHub.send("RespondBind", "realm-1", true) }
    }

    @Test
    fun `respondBind sends false when denied`() = runTest(testDispatcher) {
        client.connect("http://server:5062")

        client.respondBind("realm-1", false)
        verify { mockHub.send("RespondBind", "realm-1", false) }
    }

    // --- Hub handler callbacks ---

    @Test
    fun `RealmStarted handler sets realmStarted to true`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("RealmStarted"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        // Simulate server sending RealmStarted
        handlerSlot.captured.invoke("started")
        assertTrue(client.realmStarted.value)
    }

    @Test
    fun `BindRequest handler sets bindRequest`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<String>>()
        every { mockHub.on(eq("BindRequest"), capture(handlerSlot), eq(String::class.java)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke("ABC123")
        assertNotNull(client.bindRequest.value)
        assertEquals("ABC123", client.bindRequest.value?.code)
    }

    @Test
    fun `BindCancelled handler clears bindRequest`() = runTest(testDispatcher) {
        val bindReqSlot = slot<com.microsoft.signalr.Action1<String>>()
        val cancelSlot = slot<com.microsoft.signalr.Action>()
        every { mockHub.on(eq("BindRequest"), capture(bindReqSlot), eq(String::class.java)) } returns mockk()
        every { mockHub.on(eq("BindCancelled"), capture(cancelSlot)) } returns mockk()

        client.connect("http://server:5062")

        // First set a bind request
        bindReqSlot.captured.invoke("ABC")
        assertNotNull(client.bindRequest.value)

        // Then cancel it
        cancelSlot.captured.invoke()
        assertNull(client.bindRequest.value)
    }

    @Test
    fun `ClientEliminated handler sets eliminated when matching clientId`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<String>>()
        every { mockHub.on(eq("ClientEliminated"), capture(handlerSlot), eq(String::class.java)) } returns mockk()
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm("123456", "my-client-id")

        handlerSlot.captured.invoke("my-client-id")
        assertTrue(client.eliminated.value)
    }

    @Test
    fun `ClientEliminated handler ignores different clientId`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<String>>()
        every { mockHub.on(eq("ClientEliminated"), capture(handlerSlot), eq(String::class.java)) } returns mockk()
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm("123456", "my-client-id")

        handlerSlot.captured.invoke("other-client-id")
        assertFalse(client.eliminated.value)
    }

    @Test
    fun `Error handler sets error from server message`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<String>>()
        every { mockHub.on(eq("Error"), capture(handlerSlot), eq(String::class.java)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke("Realm is full")
        assertNotNull(client.error.value)
        // UserFriendlyErrors passes through realm-related messages
        assertTrue(client.error.value!!.contains("Realm"))
    }

    @Test
    fun `YouWereKicked handler sets error and disconnects`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action>()
        every { mockHub.on(eq("YouWereKicked"), capture(handlerSlot)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke()
        assertEquals("You were kicked from the realm", client.error.value)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `RealmEnded handler parses summary data`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("RealmEnded"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        val summaryMap = mapOf<String, Any>(
            "durationSeconds" to 300.0,
            "totalDistanceMeters" to 1500.0,
            "totalSteps" to 1800,
            "averageHeartRate" to 140,
            "maxHeartRate" to 175,
            "averageSpeedKmh" to 8.5,
            "avgCadenceSpm" to 160,
            "timeInZone" to mapOf("1" to 60, "2" to 120),
            "activePeriodSeconds" to 280.0,
            "participantCount" to 2,
            "isTeamFormat" to true,
            "clientSummaries" to listOf(
                mapOf<String, Any>(
                    "clientId" to "c1",
                    "name" to "Alice",
                    "steps" to 1000,
                    "distanceMeters" to 800.0,
                    "averageHeartRate" to 135,
                    "maxHeartRate" to 170,
                    "avgCadenceSpm" to 155,
                    "timeInZone" to mapOf("1" to 30, "2" to 60),
                    "teamName" to "Red",
                    "teamColor" to "#FF0000"
                )
            )
        )

        handlerSlot.captured.invoke(summaryMap)

        val result = client.realmEnded.value
        assertNotNull(result)
        assertEquals(300.0, result!!.durationSeconds, 0.001)
        assertEquals(1500.0, result.totalDistanceMeters, 0.001)
        assertEquals(1800, result.totalSteps)
        assertEquals(140, result.averageHeartRate)
        assertEquals(175, result.maxHeartRate)
        assertEquals(8.5, result.averageSpeedKmh, 0.001)
        assertEquals(160, result.avgCadenceSpm)
        assertEquals(2, result.timeInZone.size)
        assertEquals(60, result.timeInZone["1"])
        assertEquals(280.0, result.activePeriodSeconds, 0.001)
        assertEquals(2, result.participantCount)
        assertTrue(result.isTeamFormat)
        assertEquals(1, result.clientSummaries.size)
        assertEquals("Alice", result.clientSummaries[0].name)
        assertEquals(1000, result.clientSummaries[0].steps)
        assertEquals("Red", result.clientSummaries[0].teamName)
        assertEquals("#FF0000", result.clientSummaries[0].teamColor)
    }

    @Test
    fun `RealmEnded handler handles empty summary`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("RealmEnded"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke(emptyMap<String, Any>())

        val result = client.realmEnded.value
        assertNotNull(result)
        assertEquals(0.0, result!!.durationSeconds, 0.001)
        assertEquals(0, result.totalSteps)
        assertTrue(result.clientSummaries.isEmpty())
    }

    @Test
    fun `RealmEnded handler handles non-map input`() = runTest(testDispatcher) {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("RealmEnded"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        // Pass a non-map value — should use empty map fallback
        handlerSlot.captured.invoke("not a map")

        val result = client.realmEnded.value
        assertNotNull(result)
        assertEquals(0.0, result!!.durationSeconds, 0.001)
    }

    // --- onClosed handler ---

    @Test
    fun `onClosed sets DISCONNECTED when intentional`() = runTest(testDispatcher) {
        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()

        client.connect("http://server:5062")

        // disconnect() sets intentionalDisconnect = true
        client.disconnect()

        // Simulate onClosed callback
        closedSlot.captured.invoke(null)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `onClosed sets RECONNECTING when unintentional with joinCode`() = runTest(testDispatcher) {
        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        client.connect("http://server:5062")

        client.joinRealm("123456", "client-1")

        // Simulate unexpected close
        closedSlot.captured.invoke(RuntimeException("connection lost"))
        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }
}

class BindRequestDataTest {

    @Test
    fun `BindRequestData stores code`() {
        val data = BindRequestData(code = "ABCD12")
        assertEquals("ABCD12", data.code)
    }

    @Test
    fun `BindRequestData equality works`() {
        val a = BindRequestData(code = "123")
        val b = BindRequestData(code = "123")
        assertEquals(a, b)
    }

    @Test
    fun `BindRequestData inequality works`() {
        val a = BindRequestData(code = "123")
        val b = BindRequestData(code = "456")
        assertNotEquals(a, b)
    }

    @Test
    fun `BindRequestData copy works`() {
        val original = BindRequestData(code = "ABC")
        val copy = original.copy(code = "XYZ")
        assertEquals("XYZ", copy.code)
    }
}

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

    @Test
    fun `valueOf returns correct enum`() {
        assertEquals(ConnectionState.DISCONNECTED, ConnectionState.valueOf("DISCONNECTED"))
        assertEquals(ConnectionState.CONNECTING, ConnectionState.valueOf("CONNECTING"))
        assertEquals(ConnectionState.CONNECTED, ConnectionState.valueOf("CONNECTED"))
        assertEquals(ConnectionState.RECONNECTING, ConnectionState.valueOf("RECONNECTING"))
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
        assertEquals(0.0, data.elevationGainMeters, 0.001)
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
        assertEquals(0.0, data.elevationGainMeters, 0.001)
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
        assertEquals(2, data.clientSummaries.size)
        assertEquals("Alice", data.clientSummaries[0].name)
        assertEquals(1800, data.totalSteps)
        assertTrue(data.isTeamFormat)
    }

    @Test
    fun `copy preserves team format`() {
        val original = RealmSummaryData(isTeamFormat = true, participantCount = 5)
        val copy = original.copy(participantCount = 10)
        assertTrue(copy.isTeamFormat)
        assertEquals(10, copy.participantCount)
    }
}

/**
 * Tests for the health check loop in SignalRClient (healthCheckEnabled = true).
 * Uses TestScope + StandardTestDispatcher so advanceTimeBy() controls the 10-second
 * delay inside startHealthCheck().
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientHealthCheckTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient
    private lateinit var mockHub: HubConnection
    private lateinit var mockBuilder: com.microsoft.signalr.HttpHubConnectionBuilder

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        // healthCheckEnabled = true so startHealthCheck() actually runs
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = true
        )

        mockHub = mockk(relaxed = true)
        mockBuilder = mockk(relaxed = true)

        every { mockHub.start() } returns Completable.complete()
        every { mockHub.stop() } returns Completable.complete()
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED
        // Default Ping succeeds
        every { mockHub.invoke(Boolean::class.java, "Ping") } returns Single.just(true)

        mockkStatic(HubConnectionBuilder::class)
        every { HubConnectionBuilder.create(any<String>()) } returns mockBuilder
        every { mockBuilder.shouldSkipNegotiate(any<Boolean>()) } returns mockBuilder
        every { mockBuilder.build() } returns mockHub
    }

    @After
    fun tearDown() {
        client.dispose()
        unmockkStatic(HubConnectionBuilder::class)
        Dispatchers.resetMain()
    }

    // Helper: directly inject hub state and start health check via reflection, bypassing
    // withContext(Dispatchers.IO) in connect() which would introduce real-thread race conditions
    // against the StandardTestDispatcher's virtual clock.
    private fun setupHealthCheckDirectly(joinCode: String? = null) {
        val hubField = SignalRClient::class.java.getDeclaredField("hubConnection")
        hubField.isAccessible = true
        hubField.set(client, mockHub)

        val connStateField = SignalRClient::class.java.getDeclaredField("_connectionState")
        connStateField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val connFlow = connStateField.get(client) as kotlinx.coroutines.flow.MutableStateFlow<ConnectionState>
        connFlow.value = ConnectionState.CONNECTED

        val intentionalField = SignalRClient::class.java.getDeclaredField("intentionalDisconnect")
        intentionalField.isAccessible = true
        (intentionalField.get(client) as java.util.concurrent.atomic.AtomicBoolean).set(false)

        if (joinCode != null) {
            val joinCodeField = SignalRClient::class.java.getDeclaredField("currentJoinCode")
            joinCodeField.isAccessible = true
            joinCodeField.set(client, joinCode)

            val serverUrlField = SignalRClient::class.java.getDeclaredField("currentServerUrl")
            serverUrlField.isAccessible = true
            serverUrlField.set(client, "http://server:5062")

            val clientIdField = SignalRClient::class.java.getDeclaredField("currentClientId")
            clientIdField.isAccessible = true
            clientIdField.set(client, "client-1")
        }

        val startHealthCheck = SignalRClient::class.java.getDeclaredMethod("startHealthCheck")
        startHealthCheck.isAccessible = true
        startHealthCheck.invoke(client)
    }

    @Test
    fun `health check ping is called after 10 seconds`() = testScope.runTest {
        setupHealthCheckDirectly()

        // runCurrent() starts the health check coroutine so it reaches delay(10_000) and
        // registers with the virtual clock. advanceTimeBy then fires that delay.
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(11_000L)
        testScope.testScheduler.runCurrent()

        verify(atLeast = 1) { mockHub.invoke(Boolean::class.java, "Ping") }
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `health check single ping failure does not trigger reconnect`() = testScope.runTest {
        every { mockHub.invoke(Boolean::class.java, "Ping") } returns Single.error(RuntimeException("timeout"))

        setupHealthCheckDirectly()

        // One iteration: start coroutine, 10 s delay, Ping failure (consecutiveFailures = 1)
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(11_000L)
        testScope.testScheduler.runCurrent()

        // Still CONNECTED — need 2 consecutive failures to trigger reconnect
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `health check two consecutive failures transitions to RECONNECTING`() = testScope.runTest {
        every { mockHub.invoke(Boolean::class.java, "Ping") } returns Single.error(RuntimeException("timeout"))

        // Pass joinCode so triggerReconnectIfNeeded() actually sets RECONNECTING
        setupHealthCheckDirectly(joinCode = "123456")

        // Bootstrap the health check coroutine, then advance through two 10-second intervals
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(10_000L)
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(10_000L)
        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }

    @Test
    fun `health check resets failure count after a successful ping`() = testScope.runTest {
        // Fail on first call, succeed on second, fail on third — never 2 consecutive
        var callCount = 0
        every { mockHub.invoke(Boolean::class.java, "Ping") } answers {
            callCount++
            if (callCount == 1 || callCount == 3) Single.error(RuntimeException("timeout"))
            else Single.just(true)
        }

        setupHealthCheckDirectly(joinCode = "123456")

        // Bootstrap, then three 10-second intervals
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(10_000L)
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(10_000L)
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(10_000L)
        testScope.testScheduler.runCurrent()

        // Never had 2 consecutive failures, so still CONNECTED
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `health check does not call ping after intentional disconnect`() = testScope.runTest {
        setupHealthCheckDirectly()

        // Set intentionalDisconnect = true before the health check fires
        val intentionalField = SignalRClient::class.java.getDeclaredField("intentionalDisconnect")
        intentionalField.isAccessible = true
        (intentionalField.get(client) as java.util.concurrent.atomic.AtomicBoolean).set(true)

        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(11_000L)
        testScope.testScheduler.runCurrent()

        // Ping should never have been called because the loop exits on intentionalDisconnect
        verify(exactly = 0) { mockHub.invoke(Boolean::class.java, "Ping") }
    }

    @Test
    fun `health check exits gracefully when hubConnection is null`() = testScope.runTest {
        setupHealthCheckDirectly()

        // Null out hubConnection via reflection to simulate external nullification
        val field = SignalRClient::class.java.getDeclaredField("hubConnection")
        field.isAccessible = true
        field.set(client, null)

        // Should not crash — the loop breaks when hubConnection is null
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(11_000L)
        testScope.testScheduler.runCurrent()
        // No assertion needed — absence of exception is the contract
    }

    @Test
    fun `health check triggers RECONNECTING when hub reports DISCONNECTED state`() = testScope.runTest {
        // Hub reports DISCONNECTED so the loop calls triggerReconnectIfNeeded()
        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        // joinCode must be set so the guard in triggerReconnectIfNeeded() passes
        setupHealthCheckDirectly(joinCode = "123456")

        // Bootstrap the health check coroutine, then fire the 10-second delay
        testScope.testScheduler.runCurrent()
        testScope.testScheduler.advanceTimeBy(11_000L)
        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }
}

/**
 * Tests for the reconnect logic in SignalRClient — covers attemptReconnect(),
 * manualReconnect(), and onNetworkAvailable() triggering reconnects.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientReconnectTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient
    private lateinit var mockHub: HubConnection
    private lateinit var mockBuilder: com.microsoft.signalr.HttpHubConnectionBuilder

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = false
        )

        mockHub = mockk(relaxed = true)
        mockBuilder = mockk(relaxed = true)

        every { mockHub.start() } returns Completable.complete()
        every { mockHub.stop() } returns Completable.complete()
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        mockkStatic(HubConnectionBuilder::class)
        every { HubConnectionBuilder.create(any<String>()) } returns mockBuilder
        every { mockBuilder.shouldSkipNegotiate(any<Boolean>()) } returns mockBuilder
        every { mockBuilder.build() } returns mockHub
    }

    @After
    fun tearDown() {
        client.dispose()
        unmockkStatic(HubConnectionBuilder::class)
        Dispatchers.resetMain()
    }

    @Test
    fun `attemptReconnect succeeds on first try via onClosed`() = testScope.runTest {
        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()

        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // Simulate unexpected close — triggers attemptReconnect with immediateFirstAttempt=false
        closedSlot.captured.invoke(RuntimeException("dropped"))

        // Allow the reconnect coroutine to run: first attempt has a 2000ms delay
        testScope.testScheduler.advanceTimeBy(2_100L)
        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `attemptReconnect exhausts max attempts and sets DISCONNECTED with error`() = testScope.runTest {
        // All reconnect connection attempts fail
        every { mockHub.start() } returnsMany listOf(
            Completable.complete(), // initial connect succeeds
            Completable.error(RuntimeException("refused")), // all reconnects fail
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused")),
            Completable.error(RuntimeException("refused"))
        )

        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()

        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // Trigger reconnect
        closedSlot.captured.invoke(RuntimeException("dropped"))

        // Advance through all 10 attempts: delays are 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s, 30s
        // Total max = 2+4+8+16+30+30+30+30+30+30 = 210 seconds; add extra buffer
        testScope.testScheduler.advanceTimeBy(220_000L)
        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertEquals("Lost connection to server", client.error.value)
    }

    @Test
    fun `attemptReconnect re-joins realm on successful reconnect`() = testScope.runTest {
        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()

        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1", name = "Alice", age = 30, heightCm = 165.0, weightKg = 60.0)

        // Reset invocation counts so we can verify the re-join call specifically
        io.mockk.clearMocks(mockHub, answers = false, recordedCalls = true, verificationMarks = true)

        closedSlot.captured.invoke(RuntimeException("dropped"))

        testScope.testScheduler.advanceTimeBy(2_100L)
        testScope.testScheduler.runCurrent()

        verify(atLeast = 1) { mockHub.invoke(eq("JoinRealm"), eq("123456"), eq("client-1"), any()) }
    }

    @Test
    fun `manualReconnect when already CONNECTED is a no-op`() = testScope.runTest {
        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)

        io.mockk.clearMocks(mockHub, answers = false, recordedCalls = true, verificationMarks = true)

        client.manualReconnect()

        // No new connection attempts should have been made
        testScope.testScheduler.runCurrent()
        verify(exactly = 0) { mockHub.start() }
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `manualReconnect when no joinCode is a no-op`() = testScope.runTest {
        // Fresh client: no joinCode set, no connect
        client.manualReconnect()

        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        // start() should never have been called
        verify(exactly = 0) { mockHub.start() }
    }

    @Test
    fun `manualReconnect when no serverUrl is a no-op`() = testScope.runTest {
        // Set joinCode via reflection but leave serverUrl null
        val joinCodeField = SignalRClient::class.java.getDeclaredField("currentJoinCode")
        joinCodeField.isAccessible = true
        joinCodeField.set(client, "123456")

        // serverUrl is still null, so manualReconnect should return early
        client.manualReconnect()

        testScope.testScheduler.runCurrent()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        verify(exactly = 0) { mockHub.start() }
    }

    @Test
    fun `onNetworkAvailable triggers RECONNECTING when hub is disconnected but joinCode exists`() = testScope.runTest {
        val closedSlot = slot<com.microsoft.signalr.OnClosedCallback>()
        every { mockHub.onClosed(capture(closedSlot)) } returns mockk()

        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // Make the hub report DISCONNECTED but do NOT disconnect intentionally
        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        // Reset intentionalDisconnect to false (it may have been left true from earlier ops)
        val intentionalField = SignalRClient::class.java.getDeclaredField("intentionalDisconnect")
        intentionalField.isAccessible = true
        (intentionalField.get(client) as java.util.concurrent.atomic.AtomicBoolean).set(false)

        client.onNetworkAvailable()

        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }

    @Test
    fun `onNetworkAvailable skips when hub is still CONNECTED`() = testScope.runTest {
        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // Hub still reports CONNECTED
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED

        val intentionalField = SignalRClient::class.java.getDeclaredField("intentionalDisconnect")
        intentionalField.isAccessible = true
        (intentionalField.get(client) as java.util.concurrent.atomic.AtomicBoolean).set(false)

        client.onNetworkAvailable()

        // Should stay CONNECTED — the guard `conn.connectionState == CONNECTED` returns early
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }
}

/**
 * Tests for the reconnect-triggering paths inside sendWearableData().
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientSendWearableDataReconnectTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient
    private lateinit var mockHub: HubConnection
    private lateinit var mockBuilder: com.microsoft.signalr.HttpHubConnectionBuilder

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = false
        )

        mockHub = mockk(relaxed = true)
        mockBuilder = mockk(relaxed = true)

        every { mockHub.start() } returns Completable.complete()
        every { mockHub.stop() } returns Completable.complete()
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED
        every { mockHub.invoke(eq("JoinRealm"), any(), any(), any()) } returns Completable.complete()

        mockkStatic(HubConnectionBuilder::class)
        every { HubConnectionBuilder.create(any<String>()) } returns mockBuilder
        every { mockBuilder.shouldSkipNegotiate(any<Boolean>()) } returns mockBuilder
        every { mockBuilder.build() } returns mockHub
    }

    @After
    fun tearDown() {
        client.dispose()
        unmockkStatic(HubConnectionBuilder::class)
        Dispatchers.resetMain()
    }

    private fun wearableData() = WearableData("client-1", 140, 500, "2026-01-01T00:00:00Z")

    @Test
    fun `sendWearableData triggers RECONNECTING when hub reports DISCONNECTED`() = testScope.runTest {
        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // Hub now reports DISCONNECTED while our logical state is still CONNECTED
        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        client.sendWearableData("realm-abc", wearableData())

        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }

    @Test
    fun `sendWearableData triggers RECONNECTING when send throws`() = testScope.runTest {
        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")

        // send() throws to simulate a dead connection
        every { mockHub.send(eq("SendWearableData"), any(), any<HashMap<String, Any>>()) } throws RuntimeException("broken pipe")

        client.sendWearableData("realm-abc", wearableData())

        assertEquals(ConnectionState.RECONNECTING, client.connectionState.value)
    }

    @Test
    fun `sendWearableData does NOT trigger reconnect after intentional disconnect`() = testScope.runTest {
        client.connect("http://server:5062")
        client.joinRealm("123456", "client-1")
        client.disconnect()

        // Hub reports DISCONNECTED and we ARE intentionally disconnected
        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        client.sendWearableData("realm-abc", wearableData())

        // State must stay DISCONNECTED, not flip to RECONNECTING
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `sendWearableData does NOT trigger reconnect when no joinCode`() = testScope.runTest {
        // Connect but do NOT joinRealm — so currentJoinCode remains null
        client.connect("http://server:5062")

        every { mockHub.connectionState } returns HubConnectionState.DISCONNECTED

        client.sendWearableData("realm-abc", wearableData())

        // Guard condition requires joinCode != null — no reconnect should fire
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }
}

/**
 * Tests for sendCalibrationData() and the calibration-related hub handlers
 * (CalibrationComplete and JoinedCalibrationSession).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignalRClientCalibrationTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)
    private lateinit var client: SignalRClient
    private lateinit var mockHub: HubConnection
    private lateinit var mockBuilder: com.microsoft.signalr.HttpHubConnectionBuilder

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = SignalRClient(
            reconnectScope = testScope.backgroundScope,
            healthCheckEnabled = false
        )

        mockHub = mockk(relaxed = true)
        mockBuilder = mockk(relaxed = true)

        every { mockHub.start() } returns Completable.complete()
        every { mockHub.stop() } returns Completable.complete()
        every { mockHub.connectionState } returns HubConnectionState.CONNECTED

        mockkStatic(HubConnectionBuilder::class)
        every { HubConnectionBuilder.create(any<String>()) } returns mockBuilder
        every { mockBuilder.shouldSkipNegotiate(any<Boolean>()) } returns mockBuilder
        every { mockBuilder.build() } returns mockHub
    }

    @After
    fun tearDown() {
        client.dispose()
        unmockkStatic(HubConnectionBuilder::class)
        Dispatchers.resetMain()
    }

    // --- sendCalibrationData ---

    @Test
    fun `sendCalibrationData sends to hub when connected`() = testScope.runTest {
        client.connect("http://server:5062")

        client.sendCalibrationData("session-42", 1200)

        verify { mockHub.send("SendCalibrationData", "session-42", 1200) }
    }

    @Test
    fun `sendCalibrationData does nothing when no hub connection`() {
        // No connect() call — hubConnection is null, must not throw
        client.sendCalibrationData("session-1", 500)
        // Absence of exception is the assertion
    }

    @Test
    fun `sendCalibrationData silently handles exception from send`() = testScope.runTest {
        every { mockHub.send(eq("SendCalibrationData"), any(), any<Int>()) } throws RuntimeException("io error")

        client.connect("http://server:5062")

        // Must not throw or change connection state
        client.sendCalibrationData("session-1", 300)
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    // --- CalibrationComplete hub handler ---

    @Test
    fun `CalibrationComplete handler parses points and updates flow`() = testScope.runTest {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("CalibrationComplete"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        val pointsList = listOf(
            mapOf("speedKmh" to 6.0, "strideFactor" to 0.38),
            mapOf("speedKmh" to 10.0, "strideFactor" to 0.52),
            mapOf("speedKmh" to 14.0, "strideFactor" to 0.67)
        )
        handlerSlot.captured.invoke(pointsList)

        val result = client.calibrationComplete.value
        assertNotNull(result)
        assertEquals(3, result!!.size)
        assertEquals(6.0, result[0].speedKmh, 0.001)
        assertEquals(0.38, result[0].strideFactor, 0.001)
        assertEquals(10.0, result[1].speedKmh, 0.001)
        assertEquals(14.0, result[2].speedKmh, 0.001)
        assertEquals(0.67, result[2].strideFactor, 0.001)
    }

    @Test
    fun `CalibrationComplete handler ignores empty list`() = testScope.runTest {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("CalibrationComplete"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke(emptyList<Any>())

        // Empty list means no valid points — flow must stay null
        assertNull(client.calibrationComplete.value)
    }

    @Test
    fun `JoinedCalibrationSession handler sets calibrationSessionId flow`() = testScope.runTest {
        val handlerSlot = slot<com.microsoft.signalr.Action1<String>>()
        every { mockHub.on(eq("JoinedCalibrationSession"), capture(handlerSlot), eq(String::class.java)) } returns mockk()

        client.connect("http://server:5062")

        handlerSlot.captured.invoke("cal-session-xyz")

        assertEquals("cal-session-xyz", client.calibrationSessionId.value)
    }

    @Test
    fun `CalibrationComplete handler ignores malformed items missing required fields`() = testScope.runTest {
        val handlerSlot = slot<com.microsoft.signalr.Action1<Any>>()
        every { mockHub.on(eq("CalibrationComplete"), capture(handlerSlot), eq(Any::class.java)) } returns mockk()

        client.connect("http://server:5062")

        // Items missing speedKmh or strideFactor are filtered out via mapNotNull
        val malformedList = listOf(
            mapOf("speedKmh" to 8.0),          // missing strideFactor
            mapOf("strideFactor" to 0.45),      // missing speedKmh
            mapOf<String, Any>()                // completely empty
        )
        handlerSlot.captured.invoke(malformedList)

        // All items filtered → empty list → flow stays null (isEmpty check in handler)
        assertNull(client.calibrationComplete.value)
    }
}

/**
 * Tests for the StrideCalibrationPoint data class.
 */
class StrideCalibrationPointTest {

    @Test
    fun `default values are zero`() {
        val point = StrideCalibrationPoint()
        assertEquals(0.0, point.speedKmh, 0.001)
        assertEquals(0.0, point.strideFactor, 0.001)
    }

    @Test
    fun `custom values are stored correctly`() {
        val point = StrideCalibrationPoint(speedKmh = 10.5, strideFactor = 0.54)
        assertEquals(10.5, point.speedKmh, 0.001)
        assertEquals(0.54, point.strideFactor, 0.001)
    }

    @Test
    fun `equality holds for identical values`() {
        val a = StrideCalibrationPoint(speedKmh = 8.0, strideFactor = 0.42)
        val b = StrideCalibrationPoint(speedKmh = 8.0, strideFactor = 0.42)
        assertEquals(a, b)
    }

    @Test
    fun `inequality holds for different values`() {
        val a = StrideCalibrationPoint(speedKmh = 8.0, strideFactor = 0.42)
        val b = StrideCalibrationPoint(speedKmh = 9.0, strideFactor = 0.42)
        assertNotEquals(a, b)
    }

    @Test
    fun `copy produces independent instance with overridden field`() {
        val original = StrideCalibrationPoint(speedKmh = 6.0, strideFactor = 0.38)
        val copy = original.copy(strideFactor = 0.40)
        assertEquals(6.0, copy.speedKmh, 0.001)
        assertEquals(0.40, copy.strideFactor, 0.001)
        // Original is unchanged
        assertEquals(0.38, original.strideFactor, 0.001)
    }

    @Test
    fun `destructuring returns correct components`() {
        val point = StrideCalibrationPoint(speedKmh = 12.0, strideFactor = 0.60)
        val (speed, stride) = point
        assertEquals(12.0, speed, 0.001)
        assertEquals(0.60, stride, 0.001)
    }
}

/**
 * Tests for the top-level parseStrideCalibration() function.
 */
class ParseStrideCalibrationTest {

    @Test
    fun `null input returns null`() {
        assertNull(parseStrideCalibration(null))
    }

    @Test
    fun `empty string returns null`() {
        assertNull(parseStrideCalibration(""))
    }

    @Test
    fun `blank string returns null`() {
        assertNull(parseStrideCalibration("   "))
    }

    @Test
    fun `valid JSON array returns list of points`() {
        val json = """[{"speedKmh":6.0,"strideFactor":0.38},{"speedKmh":10.0,"strideFactor":0.52}]"""
        val result = parseStrideCalibration(json)
        assertNotNull(result)
        assertEquals(2, result!!.size)
        assertEquals(6.0, result[0].speedKmh, 0.001)
        assertEquals(0.38, result[0].strideFactor, 0.001)
        assertEquals(10.0, result[1].speedKmh, 0.001)
        assertEquals(0.52, result[1].strideFactor, 0.001)
    }

    @Test
    fun `malformed JSON returns null`() {
        assertNull(parseStrideCalibration("{not valid json"))
        assertNull(parseStrideCalibration("not json at all"))
        assertNull(parseStrideCalibration("[{broken"))
    }

    @Test
    fun `empty JSON array returns empty list`() {
        val result = parseStrideCalibration("[]")
        assertNotNull(result)
        assertTrue(result!!.isEmpty())
    }

    @Test
    fun `JSON array with missing required field returns null`() {
        // getDouble("speedKmh") will throw JSONException if key is absent, caught → null
        val json = """[{"onlyStrideFactor":0.42}]"""
        assertNull(parseStrideCalibration(json))
    }
}
