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
