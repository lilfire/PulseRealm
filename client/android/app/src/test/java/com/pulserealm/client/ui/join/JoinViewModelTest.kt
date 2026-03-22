package com.pulserealm.client.ui.join

import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.model.RealmInfo
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmApi
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

@OptIn(ExperimentalCoroutinesApi::class)
class JoinViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var signalRClient: SignalRClient
    private lateinit var prefs: SharedPreferences
    private lateinit var editor: SharedPreferences.Editor
    private lateinit var viewModel: JoinViewModel

    private val connectionStateFlow = MutableStateFlow(ConnectionState.DISCONNECTED)
    private val errorFlow = MutableStateFlow<String?>(null)

    private fun createViewModel(serverUrl: String? = null): JoinViewModel {
        val handle = if (serverUrl != null) SavedStateHandle(mapOf("serverUrl" to serverUrl)) else SavedStateHandle()
        return JoinViewModel(signalRClient, prefs, handle).also { it.ioDispatcher = testDispatcher }
    }

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
        every { prefs.getString("cached_server_url", null) } returns null
        every { prefs.getString("stride_calibration", null) } returns null

        every { signalRClient.calibrationSessionId } returns MutableStateFlow(null)

        viewModel = createViewModel()
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

        val vm = createViewModel()
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
        // Trigger an error via join with empty code (playerName is set, joinCode is empty)
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

    // --- Join validation ---

    @Test
    fun `join with empty join code shows error`() {
        viewModel.updateJoinCode("")
        viewModel.join()
        assertEquals("Enter a join code", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join with empty player name shows error`() {
        viewModel.updatePlayerName("")
        viewModel.updateJoinCode("123456")
        viewModel.join()
        assertEquals("Set up your profile first", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join with empty server URL shows error`() {
        // ViewModel initialized with empty SavedStateHandle so serverUrl is ""
        viewModel.updateJoinCode("123456")
        viewModel.join()
        assertEquals("No server connected", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join with empty code does not set loading`() {
        viewModel.join()
        assertFalse(viewModel.uiState.value.isLoading)
    }

    // --- Join happy path ---

    @Test
    fun `join happy path connects and sets joined state`() = runTest {
        // Provide a server URL via SavedStateHandle
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm("123456") } returns RealmInfo(
            id = "realm-abc",
            joinCode = "123456",
            mode = "competition",
            status = "Lobby"
        )
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertNotNull(vm.uiState.value.realmInfo)
        assertEquals("realm-abc", vm.uiState.value.realmInfo?.id)
        assertEquals("competition", vm.uiState.value.realmInfo?.mode)
        assertNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `join sets loading state while in progress`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            assertTrue(vm.uiState.value.isLoading)
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `join calls connect with correct server URL`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        coVerify { signalRClient.connect("http://192.168.1.100:5062") }
    }

    @Test
    fun `join calls joinRealm with correct parameters`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("654321")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "654321", "social", "ts")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        coVerify {
            signalRClient.joinRealm(
                "654321",
                "wear-test1234",
                "TestPlayer",
                25,
                175.0,
                70.0,
                any(),
                any(),
                any(),
                any()
            )
        }
    }

    @Test
    fun `join saves server URL on success`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        verify { editor.putString("cached_server_url", "http://192.168.1.100:5062") }
    }

    // --- Join failure paths ---

    @Test
    fun `join fails when connection fails`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.DISCONNECTED
            errorFlow.value = "Connection refused"
        }

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Connection refused", vm.uiState.value.errorMessage)
    }

    @Test
    fun `join fails when connection throws exception`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } throws RuntimeException("Network error")

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Could not join the realm", vm.uiState.value.errorMessage)
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `join fails when joinRealm throws`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } throws Exception("Could not join the realm")

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Could not join the realm", vm.uiState.value.errorMessage)
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `join fails when REST API call throws`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } throws RuntimeException("HTTP 404")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Realm not found — check the join code", vm.uiState.value.errorMessage)
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `join clears previous error before starting`() = runTest {
        // Trigger an error first (empty join code)
        viewModel.updateJoinCode("")
        viewModel.join()
        assertNotNull(viewModel.uiState.value.errorMessage)

        // Now set up a ViewModel with a valid server URL and join
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } returns Unit

        val mockApi = mockk<RealmApi>()
        coEvery { mockApi.getRealm(any()) } returns RealmInfo("r1", "123456", "social", "ts")
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        assertNull(vm.uiState.value.errorMessage)
        assertTrue(vm.uiState.value.isJoined)
    }

    // --- Disconnect ---

    @Test
    fun `disconnect resets join state`() = runTest(testDispatcher) {
        viewModel.disconnect()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertNull(viewModel.uiState.value.realmInfo)
        coVerify { signalRClient.disconnect() }
    }

    // --- Initial state ---

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
