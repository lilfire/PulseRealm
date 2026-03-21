package com.pulserealm.client.ui.join

import android.content.SharedPreferences
import com.pulserealm.client.data.model.RealmInfo
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.RealmApi
import com.pulserealm.client.data.network.ServerDiscoveryClient
import com.pulserealm.client.data.network.SignalRClient
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.net.InetAddress

@OptIn(ExperimentalCoroutinesApi::class)
class JoinViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var signalRClient: SignalRClient
    private lateinit var prefs: SharedPreferences
    private lateinit var editor: SharedPreferences.Editor
    private lateinit var discoveryClient: ServerDiscoveryClient
    private lateinit var viewModel: JoinViewModel

    private val connectionStateFlow = MutableStateFlow(ConnectionState.DISCONNECTED)
    private val errorFlow = MutableStateFlow<String?>(null)

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        signalRClient = mockk(relaxed = true)
        every { signalRClient.connectionState } returns connectionStateFlow
        every { signalRClient.error } returns errorFlow

        editor = mockk(relaxed = true)
        every { editor.putString(any(), any()) } returns editor

        prefs = mockk(relaxed = true)
        every { prefs.edit() } returns editor
        every { prefs.getString("client_id", null) } returns "wear-test1234"
        every { prefs.getString("player_name", "") } returns "TestPlayer"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "175"
        every { prefs.getString("weight_kg", "") } returns "70"
        every { prefs.getString("connection_mode", "local") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns null
        every { prefs.getString("remote_server_url", "") } returns ""

        discoveryClient = mockk(relaxed = true)
        every { discoveryClient.discoveredServers } returns MutableStateFlow(emptyList())
        every { discoveryClient.isScanning } returns MutableStateFlow(false)

        viewModel = JoinViewModel(signalRClient, prefs, discoveryClient)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // --- Init / Prefs loading ---

    @Test
    fun `initial state loads client ID from prefs`() {
        assertEquals("wear-test1234", viewModel.uiState.value.clientId)
    }

    @Test
    fun `initial state loads player name from prefs`() {
        assertEquals("TestPlayer", viewModel.uiState.value.playerName)
    }

    @Test
    fun `initial state loads height from prefs`() {
        assertEquals("175", viewModel.uiState.value.heightCm)
    }

    @Test
    fun `initial state loads age from prefs`() {
        assertEquals("25", viewModel.uiState.value.age)
    }

    @Test
    fun `initial state loads weight from prefs`() {
        assertEquals("70", viewModel.uiState.value.weightKg)
    }

    @Test
    fun `generates client ID when none saved`() {
        every { prefs.getString("client_id", null) } returns null

        val vm = JoinViewModel(signalRClient, prefs, discoveryClient)
        assertTrue(vm.uiState.value.clientId.startsWith("wear-"))
        assertEquals(13, vm.uiState.value.clientId.length) // "wear-" + 8 chars
        verify { editor.putString("client_id", any()) }
    }

    // --- Join code ---

    @Test
    fun `updateJoinCode filters to digits only`() {
        viewModel.updateJoinCode("12ab34")
        assertEquals("1234", viewModel.uiState.value.joinCode)
    }

    @Test
    fun `updateJoinCode limits to 6 digits`() {
        viewModel.updateJoinCode("12345678")
        assertEquals("123456", viewModel.uiState.value.joinCode)
    }

    @Test
    fun `updateJoinCode clears error message`() {
        // Trigger an error via join with empty code
        viewModel.join()
        assertNotNull(viewModel.uiState.value.errorMessage)

        // Updating join code should clear the error
        viewModel.updateJoinCode("123")
        assertNull(viewModel.uiState.value.errorMessage)
    }

    // --- Profile settings ---

    @Test
    fun `updatePlayerName saves to prefs`() {
        viewModel.updatePlayerName("NewName")
        assertEquals("NewName", viewModel.uiState.value.playerName)
        verify { editor.putString("player_name", "NewName") }
    }

    @Test
    fun `updateHeightCm filters non-numeric chars`() {
        viewModel.updateHeightCm("175.5abc")
        assertEquals("175.5", viewModel.uiState.value.heightCm)
        verify { editor.putString("height_cm", "175.5") }
    }

    @Test
    fun `updateWeightKg filters non-numeric chars`() {
        viewModel.updateWeightKg("70.2xyz")
        assertEquals("70.2", viewModel.uiState.value.weightKg)
        verify { editor.putString("weight_kg", "70.2") }
    }

    // --- Age and Max HR recalculation ---

    @Test
    fun `updateAge sets showRecalculateMaxHr for valid age`() {
        viewModel.updateAge("30")
        assertTrue(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge does not set showRecalculateMaxHr for invalid age`() {
        viewModel.updateAge("3")
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `confirmRecalculateMaxHr updates maxHrOverride and saves to prefs`() {
        viewModel.updateAge("30")
        assertTrue(viewModel.uiState.value.showRecalculateMaxHr)

        viewModel.confirmRecalculateMaxHr()
        assertEquals("190", viewModel.uiState.value.maxHrOverride)
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
        verify { editor.putInt("max_hr", 190) }
    }

    @Test
    fun `dismissRecalculateMaxHr hides dialog without changing maxHr`() {
        viewModel.updateAge("30")
        val maxHrBefore = viewModel.uiState.value.maxHrOverride

        viewModel.dismissRecalculateMaxHr()
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
        assertEquals(maxHrBefore, viewModel.uiState.value.maxHrOverride)
    }

    // --- Connection mode ---

    @Test
    fun `setConnectionMode to REMOTE shows manual entry`() {
        viewModel.setConnectionMode(ConnectionMode.REMOTE)

        assertEquals(ConnectionMode.REMOTE, viewModel.uiState.value.connectionMode)
        assertTrue(viewModel.uiState.value.showManualEntry)
        verify { editor.putString("connection_mode", "remote") }
    }

    @Test
    fun `setConnectionMode to LOCAL hides manual entry and starts scan`() {
        viewModel.setConnectionMode(ConnectionMode.LOCAL)

        assertEquals(ConnectionMode.LOCAL, viewModel.uiState.value.connectionMode)
        assertFalse(viewModel.uiState.value.showManualEntry)
        verify { editor.putString("connection_mode", "local") }
    }

    @Test
    fun `toggleManualEntry toggles showManualEntry`() {
        assertFalse(viewModel.uiState.value.showManualEntry)
        viewModel.toggleManualEntry()
        assertTrue(viewModel.uiState.value.showManualEntry)
        viewModel.toggleManualEntry()
        assertFalse(viewModel.uiState.value.showManualEntry)
    }

    @Test
    fun `toggleProfileSettings toggles showProfileSettings`() {
        assertFalse(viewModel.uiState.value.showProfileSettings)
        viewModel.toggleProfileSettings()
        assertTrue(viewModel.uiState.value.showProfileSettings)
        viewModel.toggleProfileSettings()
        assertFalse(viewModel.uiState.value.showProfileSettings)
    }

    // --- Server management ---

    @Test
    fun `changeServer shows server config`() {
        viewModel.changeServer()
        assertTrue(viewModel.uiState.value.showServerConfig)
        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `selectDiscoveredServer sets URL and hides config`() {
        val server = DiscoveredServer(
            name = "Test",
            hostname = "host",
            urls = "http://+:5062",
            version = "1.0",
            address = InetAddress.getByName("192.168.1.100")
        )
        every { discoveryClient.buildServerUrl(server) } returns "http://192.168.1.100:5062"

        viewModel.selectDiscoveredServer(server)

        assertEquals("http://192.168.1.100:5062", viewModel.uiState.value.serverUrl)
        assertFalse(viewModel.uiState.value.showServerConfig)
    }

    // --- URL handling ---

    @Test
    fun `updateRemoteUrl normalizes with http scheme`() {
        viewModel.updateRemoteUrl("192.168.1.100:5062")
        assertEquals("http://192.168.1.100:5062", viewModel.uiState.value.remoteUrl)
        assertEquals("http://192.168.1.100:5062", viewModel.uiState.value.serverUrl)
    }

    @Test
    fun `updateRemoteUrl preserves existing scheme`() {
        viewModel.updateRemoteUrl("https://example.com")
        assertEquals("https://example.com", viewModel.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl preserves http scheme`() {
        viewModel.updateRemoteUrl("http://192.168.1.100:5062")
        assertEquals("http://192.168.1.100:5062", viewModel.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl saves to prefs`() {
        viewModel.updateRemoteUrl("example.com")
        verify { editor.putString("remote_server_url", "http://example.com") }
    }

    // --- Server config ---

    @Test
    fun `confirmServer with blank URL shows error`() {
        viewModel.updateServerUrl("")
        viewModel.confirmServer()
        assertEquals("Enter a server address", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `scanForServers increments scan attempt`() {
        val initialAttempt = viewModel.scanAttempt.value
        viewModel.scanForServers()
        assertEquals(initialAttempt + 1, viewModel.scanAttempt.value)
    }

    // --- Join validation ---

    @Test
    fun `join with empty join code shows error`() {
        viewModel.updateJoinCode("")
        viewModel.join()
        assertEquals("Enter a join code", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join with empty server URL shows error`() {
        viewModel.updateJoinCode("123456")
        viewModel.join()
        assertEquals("Set a server address first", viewModel.uiState.value.errorMessage)
        assertTrue(viewModel.uiState.value.showServerConfig)
    }

    @Test
    fun `join with empty code does not set loading`() {
        viewModel.join()
        assertFalse(viewModel.uiState.value.isLoading)
    }

    // --- Join happy path ---

    @Test
    fun `join happy path connects and sets joined state`() = runTest {
        // Setup: server URL and join code
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        // Mock SignalR connect success
        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        // Mock the REST API call
        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm("123456") } returns RealmInfo(
            id = "realm-abc",
            joinCode = "123456",
            mode = "competition",
            status = "Lobby"
        )
        viewModel.realmApiFactory = { mockApi }

        // Execute join
        viewModel.join()
        advanceUntilIdle()

        // Verify
        assertTrue(viewModel.uiState.value.isJoined)
        assertFalse(viewModel.uiState.value.isLoading)
        assertNotNull(viewModel.uiState.value.realmInfo)
        assertEquals("realm-abc", viewModel.uiState.value.realmInfo?.id)
        assertEquals("competition", viewModel.uiState.value.realmInfo?.mode)
        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join sets loading state while in progress`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            // While connecting, isLoading should be true
            assertTrue(viewModel.uiState.value.isLoading)
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts", emptyList())
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        // After completion, loading should be false
        assertFalse(viewModel.uiState.value.isLoading)
    }

    @Test
    fun `join calls connect with correct server URL`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts", emptyList())
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        coVerify { signalRClient.connect("http://192.168.1.100:5062") }
    }

    @Test
    fun `join calls joinRealm with correct parameters`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("654321")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "654321", "social", "ts", emptyList())
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        coVerify {
            signalRClient.joinRealm(
                "654321",
                "wear-test1234",
                "TestPlayer",
                25,
                175.0,
                70.0
            )
        }
    }

    @Test
    fun `join saves server URL on success`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts", emptyList())
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        verify { editor.putString("cached_server_url", "http://192.168.1.100:5062") }
    }

    // --- Join failure paths ---

    @Test
    fun `join fails when connection fails`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            // Connection stays DISCONNECTED
            connectionStateFlow.value = ConnectionState.DISCONNECTED
            errorFlow.value = "Connection refused"
        }

        viewModel.join()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals("Connection refused", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join fails when connection throws exception`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } throws RuntimeException("Network error")

        viewModel.join()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals("Could not join the realm", viewModel.uiState.value.errorMessage)
        verify { signalRClient.disconnect() }
    }

    @Test
    fun `join fails when hub returns error after joinRealm`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } answers {
            errorFlow.value = "Invalid join code"
        }

        viewModel.join()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals("Invalid join code", viewModel.uiState.value.errorMessage)
        verify { signalRClient.disconnect() }
    }

    @Test
    fun `join fails when REST API call throws`() = runTest {
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } throws RuntimeException("HTTP 404")
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals("Realm not found — check the join code", viewModel.uiState.value.errorMessage)
        verify { signalRClient.disconnect() }
    }

    @Test
    fun `join clears previous error before starting`() = runTest {
        // Trigger an error first
        viewModel.updateJoinCode("")
        viewModel.join()
        assertNotNull(viewModel.uiState.value.errorMessage)

        // Now set up valid state and join
        viewModel.updateServerUrl("http://192.168.1.100:5062")
        viewModel.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery { signalRClient.joinRealm(any(), any(), any(), any(), any(), any()) } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts", emptyList())
        viewModel.realmApiFactory = { mockApi }

        viewModel.join()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.errorMessage)
        assertTrue(viewModel.uiState.value.isJoined)
    }

    // --- Disconnect ---

    @Test
    fun `disconnect resets join state`() {
        viewModel.disconnect()
        assertFalse(viewModel.uiState.value.isJoined)
        assertNull(viewModel.uiState.value.realmInfo)
        verify { signalRClient.disconnect() }
    }

    // --- Initial state ---

    @Test
    fun `initial connection mode defaults to LOCAL`() {
        assertEquals(ConnectionMode.LOCAL, viewModel.uiState.value.connectionMode)
    }

    @Test
    fun `initial state is not loading`() {
        assertFalse(viewModel.uiState.value.isLoading)
    }

    @Test
    fun `initial state is not joined`() {
        assertFalse(viewModel.uiState.value.isJoined)
    }

    @Test
    fun `initial realmInfo is null`() {
        assertNull(viewModel.uiState.value.realmInfo)
    }

    @Test
    fun `remote mode saved URL is loaded`() {
        every { prefs.getString("connection_mode", "local") } returns "remote"
        every { prefs.getString("remote_server_url", "") } returns "https://remote.example.com"

        val vm = JoinViewModel(signalRClient, prefs, discoveryClient)
        assertEquals(ConnectionMode.REMOTE, vm.uiState.value.connectionMode)
        assertEquals("https://remote.example.com", vm.uiState.value.remoteUrl)
    }
}

class ConnectionModeTest {

    @Test
    fun `ConnectionMode has LOCAL and REMOTE`() {
        assertEquals(2, ConnectionMode.values().size)
        assertNotNull(ConnectionMode.LOCAL)
        assertNotNull(ConnectionMode.REMOTE)
    }

    @Test
    fun `valueOf returns correct enum`() {
        assertEquals(ConnectionMode.LOCAL, ConnectionMode.valueOf("LOCAL"))
        assertEquals(ConnectionMode.REMOTE, ConnectionMode.valueOf("REMOTE"))
    }
}

class JoinUiStateTest {

    @Test
    fun `default state has expected values`() {
        val state = JoinUiState()
        assertEquals("", state.serverUrl)
        assertEquals("", state.joinCode)
        assertEquals("", state.playerName)
        assertEquals("", state.heightCm)
        assertEquals("", state.weightKg)
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertNull(state.realmInfo)
        assertFalse(state.isJoined)
        assertEquals("", state.clientId)
        assertTrue(state.showServerConfig)
        assertFalse(state.showProfileSettings)
        assertFalse(state.showManualEntry)
        assertEquals(ConnectionMode.LOCAL, state.connectionMode)
        assertEquals("", state.remoteUrl)
        assertFalse(state.isVerifyingServer)
    }

    @Test
    fun `copy modifies specified fields`() {
        val state = JoinUiState()
        val modified = state.copy(joinCode = "123456", isLoading = true)

        assertEquals("123456", modified.joinCode)
        assertTrue(modified.isLoading)
        assertEquals("", modified.serverUrl) // unchanged
    }

    @Test
    fun `copy preserves unmodified fields`() {
        val state = JoinUiState(
            serverUrl = "http://example.com",
            joinCode = "123456",
            playerName = "Test",
            isJoined = true
        )
        val modified = state.copy(isLoading = true)

        assertEquals("http://example.com", modified.serverUrl)
        assertEquals("123456", modified.joinCode)
        assertEquals("Test", modified.playerName)
        assertTrue(modified.isJoined)
        assertTrue(modified.isLoading)
    }
}
