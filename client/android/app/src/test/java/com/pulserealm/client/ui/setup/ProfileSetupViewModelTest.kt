package com.pulserealm.client.ui.setup

import android.content.SharedPreferences
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
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
class ProfileSetupViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var prefs: SharedPreferences
    private lateinit var editor: SharedPreferences.Editor

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        editor = mockk(relaxed = true)
        every { editor.putString(any(), any()) } returns editor

        prefs = mockk(relaxed = true)
        every { prefs.edit() } returns editor
        every { prefs.getString("player_name", "") } returns ""
        every { prefs.getString("age", "") } returns ""
        every { prefs.getString("height_cm", "") } returns ""
        every { prefs.getString("weight_kg", "") } returns ""
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): ProfileSetupViewModel = ProfileSetupViewModel(prefs)

    // ── ProfileSetupUiState data class ──────────────────────────────────

    @Test
    fun `isComplete returns true when all fields filled`() {
        val state = ProfileSetupUiState(
            playerName = "Alice",
            age = "25",
            heightCm = "170",
            weightKg = "65"
        )
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns false when playerName blank`() {
        val state = ProfileSetupUiState(playerName = "", age = "25", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when age blank`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when heightCm blank`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when weightKg blank`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false for default state`() {
        assertFalse(ProfileSetupUiState().isComplete)
    }

    @Test
    fun `isComplete returns false when field is whitespace only`() {
        val state = ProfileSetupUiState(playerName = "  ", age = "25", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `copy preserves fields`() {
        val original = ProfileSetupUiState("Alice", "25", "170", "65")
        val copy = original.copy(age = "30")
        assertEquals("Alice", copy.playerName)
        assertEquals("30", copy.age)
        assertEquals("170", copy.heightCm)
        assertEquals("65", copy.weightKg)
    }

    // ── Init / prefs loading ────────────────────────────────────────────

    @Test
    fun `loads saved playerName from prefs`() {
        every { prefs.getString("player_name", "") } returns "SavedName"
        val vm = createViewModel()
        assertEquals("SavedName", vm.uiState.value.playerName)
    }

    @Test
    fun `loads saved age from prefs`() {
        every { prefs.getString("age", "") } returns "30"
        val vm = createViewModel()
        assertEquals("30", vm.uiState.value.age)
    }

    @Test
    fun `loads saved heightCm from prefs`() {
        every { prefs.getString("height_cm", "") } returns "180"
        val vm = createViewModel()
        assertEquals("180", vm.uiState.value.heightCm)
    }

    @Test
    fun `loads saved weightKg from prefs`() {
        every { prefs.getString("weight_kg", "") } returns "75"
        val vm = createViewModel()
        assertEquals("75", vm.uiState.value.weightKg)
    }

    @Test
    fun `handles null pref values gracefully`() {
        every { prefs.getString("player_name", "") } returns null
        every { prefs.getString("age", "") } returns null
        every { prefs.getString("height_cm", "") } returns null
        every { prefs.getString("weight_kg", "") } returns null
        val vm = createViewModel()
        assertEquals("", vm.uiState.value.playerName)
        assertEquals("", vm.uiState.value.age)
        assertEquals("", vm.uiState.value.heightCm)
        assertEquals("", vm.uiState.value.weightKg)
    }

    @Test
    fun `handles empty pref values`() {
        // All prefs return "" by default in setup
        val vm = createViewModel()
        assertEquals("", vm.uiState.value.playerName)
        assertEquals("", vm.uiState.value.age)
        assertFalse(vm.uiState.value.isComplete)
    }

    // ── updatePlayerName ────────────────────────────────────────────────

    @Test
    fun `updatePlayerName updates state`() {
        val vm = createViewModel()
        vm.updatePlayerName("NewName")
        assertEquals("NewName", vm.uiState.value.playerName)
    }

    @Test
    fun `updatePlayerName saves to SharedPreferences`() {
        val vm = createViewModel()
        vm.updatePlayerName("Alice")
        verify { editor.putString("player_name", "Alice") }
        verify { editor.apply() }
    }

    @Test
    fun `updatePlayerName accepts special characters`() {
        val vm = createViewModel()
        vm.updatePlayerName("Ålice_123!@#")
        assertEquals("Ålice_123!@#", vm.uiState.value.playerName)
    }

    @Test
    fun `updatePlayerName accepts empty string`() {
        val vm = createViewModel()
        vm.updatePlayerName("Test")
        vm.updatePlayerName("")
        assertEquals("", vm.uiState.value.playerName)
    }

    // ── updateAge ───────────────────────────────────────────────────────

    @Test
    fun `updateAge passes through digits`() {
        val vm = createViewModel()
        vm.updateAge("25")
        assertEquals("25", vm.uiState.value.age)
    }

    @Test
    fun `updateAge filters non-digit characters`() {
        val vm = createViewModel()
        vm.updateAge("2a5b")
        assertEquals("25", vm.uiState.value.age)
    }

    @Test
    fun `updateAge filters dots`() {
        val vm = createViewModel()
        vm.updateAge("25.5")
        assertEquals("255", vm.uiState.value.age)
    }

    @Test
    fun `updateAge saves filtered value to prefs`() {
        val vm = createViewModel()
        vm.updateAge("3x0")
        verify { editor.putString("age", "30") }
        verify { editor.apply() }
    }

    @Test
    fun `updateAge with all non-digits results in empty string`() {
        val vm = createViewModel()
        vm.updateAge("abc")
        assertEquals("", vm.uiState.value.age)
    }

    // ── updateHeightCm ──────────────────────────────────────────────────

    @Test
    fun `updateHeightCm passes through digits`() {
        val vm = createViewModel()
        vm.updateHeightCm("175")
        assertEquals("175", vm.uiState.value.heightCm)
    }

    @Test
    fun `updateHeightCm allows dots`() {
        val vm = createViewModel()
        vm.updateHeightCm("175.5")
        assertEquals("175.5", vm.uiState.value.heightCm)
    }

    @Test
    fun `updateHeightCm filters letters`() {
        val vm = createViewModel()
        vm.updateHeightCm("17a5")
        assertEquals("175", vm.uiState.value.heightCm)
    }

    @Test
    fun `updateHeightCm saves filtered value to prefs`() {
        val vm = createViewModel()
        vm.updateHeightCm("18x0")
        verify { editor.putString("height_cm", "180") }
        verify { editor.apply() }
    }

    // ── updateWeightKg ──────────────────────────────────────────────────

    @Test
    fun `updateWeightKg passes through digits`() {
        val vm = createViewModel()
        vm.updateWeightKg("70")
        assertEquals("70", vm.uiState.value.weightKg)
    }

    @Test
    fun `updateWeightKg allows dots`() {
        val vm = createViewModel()
        vm.updateWeightKg("70.5")
        assertEquals("70.5", vm.uiState.value.weightKg)
    }

    @Test
    fun `updateWeightKg filters letters`() {
        val vm = createViewModel()
        vm.updateWeightKg("7abc0")
        assertEquals("70", vm.uiState.value.weightKg)
    }

    @Test
    fun `updateWeightKg saves filtered value to prefs`() {
        val vm = createViewModel()
        vm.updateWeightKg("65.5")
        verify { editor.putString("weight_kg", "65.5") }
        verify { editor.apply() }
    }

    // ── isComplete integration ──────────────────────────────────────────

    @Test
    fun `isComplete becomes true after filling all fields`() {
        every { prefs.getString("player_name", "") } returns "Alice"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "170"
        every { prefs.getString("weight_kg", "") } returns "65"
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isComplete)
    }

    @Test
    fun `isComplete becomes false after clearing a field`() {
        every { prefs.getString("player_name", "") } returns "Alice"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "170"
        every { prefs.getString("weight_kg", "") } returns "65"
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isComplete)
        vm.updatePlayerName("")
        assertFalse(vm.uiState.value.isComplete)
    }
}
