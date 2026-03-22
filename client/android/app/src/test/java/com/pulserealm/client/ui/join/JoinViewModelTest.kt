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
        every { editor.putInt(any(), any()) } returns editor

        prefs = mockk(relaxed = true)
        every { prefs.edit() } returns editor
        every { prefs.getString("client_id", null) } returns "wear-test1234"
        every { prefs.getString("player_name", "") } returns "TestPlayer"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "175"
        every { prefs.getString("weight_kg", "") } returns "70"
        every { prefs.getString("cached_server_url", null) } returns null
        every { prefs.getString("stride_calibration", null) } returns null
        // Default zone/hr/stride prefs — mirrors production defaults
        every { prefs.getInt("zone_1_2", 57) } returns 57
        every { prefs.getInt("zone_2_3", 63) } returns 63
        every { prefs.getInt("zone_3_4", 76) } returns 76
        every { prefs.getInt("zone_4_5", 89) } returns 89
        every { prefs.getInt("max_hr", 0) } returns 0
        every { prefs.getFloat("stride_factor", 0f) } returns 0f

        every { signalRClient.calibrationSessionId } returns MutableStateFlow(null)

        viewModel = createViewModel()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // Init / Prefs loading
    // -------------------------------------------------------------------------

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

    @Test
    fun `initial state loads default zone values from prefs`() {
        assertEquals("57", viewModel.uiState.value.zone12)
        assertEquals("63", viewModel.uiState.value.zone23)
        assertEquals("76", viewModel.uiState.value.zone34)
        assertEquals("89", viewModel.uiState.value.zone45)
    }

    @Test
    fun `initial state loads custom zone values from prefs`() {
        every { prefs.getInt("zone_1_2", 57) } returns 60
        every { prefs.getInt("zone_2_3", 63) } returns 70
        every { prefs.getInt("zone_3_4", 76) } returns 80
        every { prefs.getInt("zone_4_5", 89) } returns 90

        val vm = createViewModel()

        assertEquals("60", vm.uiState.value.zone12)
        assertEquals("70", vm.uiState.value.zone23)
        assertEquals("80", vm.uiState.value.zone34)
        assertEquals("90", vm.uiState.value.zone45)
    }

    @Test
    fun `initial state loads maxHrOverride as string when prefs value is positive`() {
        every { prefs.getInt("max_hr", 0) } returns 185

        val vm = createViewModel()

        assertEquals("185", vm.uiState.value.maxHrOverride)
    }

    @Test
    fun `initial state has empty maxHrOverride when prefs value is zero`() {
        every { prefs.getInt("max_hr", 0) } returns 0

        val vm = createViewModel()

        assertEquals("", vm.uiState.value.maxHrOverride)
    }

    @Test
    fun `initial state loads non-zero strideFactor from prefs`() {
        every { prefs.getFloat("stride_factor", 0f) } returns 0.55f

        val vm = createViewModel()

        assertEquals(0.55, vm.uiState.value.strideFactor, 0.0001)
    }

    @Test
    fun `initial state has zero strideFactor when prefs value is zero`() {
        every { prefs.getFloat("stride_factor", 0f) } returns 0f

        val vm = createViewModel()

        assertEquals(0.0, vm.uiState.value.strideFactor, 0.0)
    }

    @Test
    fun `initial state parses strideCalibration from prefs JSON`() {
        every { prefs.getString("stride_calibration", null) } returns
            """[{"speedKmh":8.0,"strideFactor":0.42},{"speedKmh":12.0,"strideFactor":0.55}]"""

        val vm = createViewModel()

        val calibration = vm.uiState.value.strideCalibration
        assertNotNull(calibration)
        assertEquals(2, calibration!!.size)
        assertEquals(8.0, calibration[0].speedKmh, 0.0001)
        assertEquals(0.42, calibration[0].strideFactor, 0.0001)
        assertEquals(12.0, calibration[1].speedKmh, 0.0001)
        assertEquals(0.55, calibration[1].strideFactor, 0.0001)
    }

    @Test
    fun `initial state has null strideCalibration when prefs has no JSON`() {
        every { prefs.getString("stride_calibration", null) } returns null

        val vm = createViewModel()

        assertNull(vm.uiState.value.strideCalibration)
    }

    @Test
    fun `initial state has null strideCalibration when prefs JSON is malformed`() {
        every { prefs.getString("stride_calibration", null) } returns "not-valid-json"

        val vm = createViewModel()

        assertNull(vm.uiState.value.strideCalibration)
    }

    // -------------------------------------------------------------------------
    // connectionState flow delegation
    // -------------------------------------------------------------------------

    @Test
    fun `connectionState delegates to signalRClient`() {
        assertSame(connectionStateFlow, viewModel.connectionState)
    }

    @Test
    fun `connectionState reflects signalRClient state changes`() {
        assertEquals(ConnectionState.DISCONNECTED, viewModel.connectionState.value)

        connectionStateFlow.value = ConnectionState.CONNECTED
        assertEquals(ConnectionState.CONNECTED, viewModel.connectionState.value)

        connectionStateFlow.value = ConnectionState.RECONNECTING
        assertEquals(ConnectionState.RECONNECTING, viewModel.connectionState.value)
    }

    // -------------------------------------------------------------------------
    // Join code
    // -------------------------------------------------------------------------

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
        viewModel.join()
        assertNotNull(viewModel.uiState.value.errorMessage)

        viewModel.updateJoinCode("123")
        assertNull(viewModel.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------------
    // Profile settings
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Age and Max HR recalculation
    // -------------------------------------------------------------------------

    @Test
    fun `updateAge sets showRecalculateMaxHr for valid age`() {
        viewModel.updateAge("30")
        assertTrue(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge does not set showRecalculateMaxHr for single digit under range`() {
        viewModel.updateAge("3")
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge filters non-digit characters`() {
        viewModel.updateAge("2a5b")
        assertEquals("25", viewModel.uiState.value.age)
    }

    @Test
    fun `updateAge saves filtered value to prefs`() {
        viewModel.updateAge("4x0")
        verify { editor.putString("age", "40") }
    }

    @Test
    fun `updateAge does not show recalculate dialog for boundary value 4`() {
        viewModel.updateAge("4")
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge does not show recalculate dialog for boundary value 121`() {
        viewModel.updateAge("121")
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge shows recalculate dialog for boundary value 5`() {
        viewModel.updateAge("5")
        assertTrue(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge shows recalculate dialog for boundary value 120`() {
        viewModel.updateAge("120")
        assertTrue(viewModel.uiState.value.showRecalculateMaxHr)
    }

    @Test
    fun `updateAge does not show recalculate dialog when input is empty`() {
        viewModel.updateAge("")
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
    fun `confirmRecalculateMaxHr returns early when age is not parseable`() {
        // Set age to a non-numeric value by bypassing the digit filter via state directly.
        // We trigger updateAge with empty string so age is "" and toIntOrNull() returns null.
        viewModel.updateAge("")
        val maxHrBefore = viewModel.uiState.value.maxHrOverride

        viewModel.confirmRecalculateMaxHr()

        // State must be unchanged — no prefs write, no maxHrOverride update
        assertEquals(maxHrBefore, viewModel.uiState.value.maxHrOverride)
        verify(exactly = 0) { editor.putInt("max_hr", any()) }
    }

    @Test
    fun `dismissRecalculateMaxHr hides dialog without changing maxHr`() {
        viewModel.updateAge("30")
        val maxHrBefore = viewModel.uiState.value.maxHrOverride

        viewModel.dismissRecalculateMaxHr()
        assertFalse(viewModel.uiState.value.showRecalculateMaxHr)
        assertEquals(maxHrBefore, viewModel.uiState.value.maxHrOverride)
    }

    // -------------------------------------------------------------------------
    // Zone update methods
    // -------------------------------------------------------------------------

    @Test
    fun `updateZone12 filters to digits only`() {
        viewModel.updateZone12("6a5")
        assertEquals("65", viewModel.uiState.value.zone12)
    }

    @Test
    fun `updateZone12 saves parsed int to prefs`() {
        viewModel.updateZone12("65")
        verify { editor.putInt("zone_1_2", 65) }
    }

    @Test
    fun `updateZone12 does not save to prefs when input is non-numeric`() {
        viewModel.updateZone12("abc")
        assertEquals("", viewModel.uiState.value.zone12)
        verify(exactly = 0) { editor.putInt("zone_1_2", any()) }
    }

    @Test
    fun `updateZone23 filters to digits only`() {
        viewModel.updateZone23("7x2")
        assertEquals("72", viewModel.uiState.value.zone23)
    }

    @Test
    fun `updateZone23 saves parsed int to prefs`() {
        viewModel.updateZone23("72")
        verify { editor.putInt("zone_2_3", 72) }
    }

    @Test
    fun `updateZone23 does not save to prefs when input is empty after filtering`() {
        viewModel.updateZone23("xyz")
        assertEquals("", viewModel.uiState.value.zone23)
        verify(exactly = 0) { editor.putInt("zone_2_3", any()) }
    }

    @Test
    fun `updateZone34 filters to digits only`() {
        viewModel.updateZone34("8b5")
        assertEquals("85", viewModel.uiState.value.zone34)
    }

    @Test
    fun `updateZone34 saves parsed int to prefs`() {
        viewModel.updateZone34("85")
        verify { editor.putInt("zone_3_4", 85) }
    }

    @Test
    fun `updateZone34 does not save to prefs when input is empty after filtering`() {
        viewModel.updateZone34("!!!")
        assertEquals("", viewModel.uiState.value.zone34)
        verify(exactly = 0) { editor.putInt("zone_3_4", any()) }
    }

    @Test
    fun `updateZone45 filters to digits only`() {
        viewModel.updateZone45("9c2")
        assertEquals("92", viewModel.uiState.value.zone45)
    }

    @Test
    fun `updateZone45 saves parsed int to prefs`() {
        viewModel.updateZone45("92")
        verify { editor.putInt("zone_4_5", 92) }
    }

    @Test
    fun `updateZone45 does not save to prefs when input is empty after filtering`() {
        viewModel.updateZone45("---")
        assertEquals("", viewModel.uiState.value.zone45)
        verify(exactly = 0) { editor.putInt("zone_4_5", any()) }
    }

    // -------------------------------------------------------------------------
    // updateMaxHrOverride
    // -------------------------------------------------------------------------

    @Test
    fun `updateMaxHrOverride filters to digits only`() {
        viewModel.updateMaxHrOverride("18a0")
        assertEquals("180", viewModel.uiState.value.maxHrOverride)
    }

    @Test
    fun `updateMaxHrOverride saves parsed int to prefs`() {
        viewModel.updateMaxHrOverride("180")
        verify { editor.putInt("max_hr", 180) }
    }

    @Test
    fun `updateMaxHrOverride saves zero to prefs when input is empty`() {
        viewModel.updateMaxHrOverride("")
        assertEquals("", viewModel.uiState.value.maxHrOverride)
        verify { editor.putInt("max_hr", 0) }
    }

    @Test
    fun `updateMaxHrOverride saves zero to prefs when input contains no digits`() {
        viewModel.updateMaxHrOverride("abc")
        assertEquals("", viewModel.uiState.value.maxHrOverride)
        verify { editor.putInt("max_hr", 0) }
    }

    // -------------------------------------------------------------------------
    // Join validation
    // -------------------------------------------------------------------------

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
        viewModel.updateJoinCode("123456")
        viewModel.join()
        assertEquals("No server connected", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `join with empty code does not set loading`() {
        viewModel.join()
        assertFalse(viewModel.uiState.value.isLoading)
    }

    // -------------------------------------------------------------------------
    // Join happy path
    // -------------------------------------------------------------------------

    @Test
    fun `join happy path connects and sets joined state`() = runTest {
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

    // -------------------------------------------------------------------------
    // Calibration join path
    // -------------------------------------------------------------------------

    @Test
    fun `join with calibration session ID creates calibration RealmInfo and skips REST call`() = runTest {
        val calibrationIdFlow = MutableStateFlow<String?>(null)
        every { signalRClient.calibrationSessionId } returns calibrationIdFlow

        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("999000")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } coAnswers {
            // Simulate server delivering JoinedCalibrationSession before delay(200) elapses
            calibrationIdFlow.value = "cal-session-xyz"
            Unit
        }

        // Ensure the factory is never called
        val mockApi = mockk<RealmApi>(relaxed = true)
        vm.realmApiFactory = { mockApi }

        vm.join()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertNotNull(vm.uiState.value.realmInfo)
        assertEquals("cal-session-xyz", vm.uiState.value.realmInfo?.id)
        assertEquals("999000", vm.uiState.value.realmInfo?.joinCode)
        assertEquals("calibration", vm.uiState.value.realmInfo?.mode)
        assertNull(vm.uiState.value.errorMessage)
        coVerify(exactly = 0) { mockApi.getRealm(any()) }
    }

    @Test
    fun `join calibration path saves server URL`() = runTest {
        val calibrationIdFlow = MutableStateFlow<String?>(null)
        every { signalRClient.calibrationSessionId } returns calibrationIdFlow

        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("999000")

        coEvery { signalRClient.connect(any()) } answers {
            connectionStateFlow.value = ConnectionState.CONNECTED
        }
        coEvery {
            signalRClient.joinRealm(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        } coAnswers {
            calibrationIdFlow.value = "cal-session-xyz"
            Unit
        }

        vm.realmApiFactory = { mockk(relaxed = true) }

        vm.join()
        advanceUntilIdle()

        verify { editor.putString("cached_server_url", "http://192.168.1.100:5062") }
    }

    // -------------------------------------------------------------------------
    // Join failure paths
    // -------------------------------------------------------------------------

    @Test
    fun `join fails when connection fails with error message`() = runTest {
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
    fun `join fails when connection fails but error flow is null defaults to fallback message`() = runTest {
        val vm = createViewModel("http%3A%2F%2F192.168.1.100%3A5062")
        vm.updateJoinCode("123456")

        coEvery { signalRClient.connect(any()) } answers {
            // Connection does not reach CONNECTED state and no error is set
            connectionStateFlow.value = ConnectionState.DISCONNECTED
            errorFlow.value = null
        }

        vm.join()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isJoined)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Could not connect to the server", vm.uiState.value.errorMessage)
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
        viewModel.updateJoinCode("")
        viewModel.join()
        assertNotNull(viewModel.uiState.value.errorMessage)

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

    // -------------------------------------------------------------------------
    // Disconnect
    // -------------------------------------------------------------------------

    @Test
    fun `disconnect resets join state`() = runTest(testDispatcher) {
        viewModel.disconnect()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isJoined)
        assertNull(viewModel.uiState.value.realmInfo)
        coVerify { signalRClient.disconnect() }
    }

    // -------------------------------------------------------------------------
    // Initial state convenience checks
    // -------------------------------------------------------------------------

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

// =============================================================================
// JoinUiState unit tests — no Android or coroutine runtime required
// =============================================================================

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
    fun `default zone values are 57 63 76 89`() {
        val state = JoinUiState()
        assertEquals("57", state.zone12)
        assertEquals("63", state.zone23)
        assertEquals("76", state.zone34)
        assertEquals("89", state.zone45)
    }

    @Test
    fun `default maxHrOverride is empty string`() {
        val state = JoinUiState()
        assertEquals("", state.maxHrOverride)
    }

    @Test
    fun `default showRecalculateMaxHr is false`() {
        val state = JoinUiState()
        assertFalse(state.showRecalculateMaxHr)
    }

    @Test
    fun `default strideCalibration is null`() {
        val state = JoinUiState()
        assertNull(state.strideCalibration)
    }

    @Test
    fun `default strideFactor is 0 point 0`() {
        val state = JoinUiState()
        assertEquals(0.0, state.strideFactor, 0.0)
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

    @Test
    fun `copy preserves zone values when not modified`() {
        val state = JoinUiState(zone12 = "60", zone23 = "70", zone34 = "80", zone45 = "90")
        val modified = state.copy(playerName = "Updated")

        assertEquals("60", modified.zone12)
        assertEquals("70", modified.zone23)
        assertEquals("80", modified.zone34)
        assertEquals("90", modified.zone45)
    }

    @Test
    fun `copy preserves strideCalibration and strideFactor when not modified`() {
        val calibration = listOf(
            com.pulserealm.client.data.network.StrideCalibrationPoint(speedKmh = 8.0, strideFactor = 0.42)
        )
        val state = JoinUiState(strideCalibration = calibration, strideFactor = 0.42)
        val modified = state.copy(playerName = "X")

        assertSame(calibration, modified.strideCalibration)
        assertEquals(0.42, modified.strideFactor, 0.0001)
    }

    @Test
    fun `equality holds for identical instances`() {
        val a = JoinUiState(serverUrl = "http://host", joinCode = "111222", playerName = "Alice")
        val b = JoinUiState(serverUrl = "http://host", joinCode = "111222", playerName = "Alice")
        assertEquals(a, b)
    }

    @Test
    fun `equality fails for different field values`() {
        val a = JoinUiState(playerName = "Alice")
        val b = JoinUiState(playerName = "Bob")
        assertNotEquals(a, b)
    }
}
