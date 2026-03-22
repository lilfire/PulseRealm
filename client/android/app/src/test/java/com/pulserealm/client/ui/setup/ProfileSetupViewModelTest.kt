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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
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
        every { editor.putInt(any(), any()) } returns editor

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

    // ── isComplete age boundary cases ───────────────────────────────────

    @Test
    fun `isComplete returns false when age is 4 below minimum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "4", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns true when age is 5 at minimum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "5", heightCm = "170", weightKg = "65")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns true when age is 120 at maximum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "120", heightCm = "170", weightKg = "65")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns false when age is 121 above maximum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "121", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    // ── isComplete height boundary cases ────────────────────────────────

    @Test
    fun `isComplete returns false when height is 49 below minimum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "49", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns true when height is 50 at minimum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "50", weightKg = "65")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns true when height is 250 at maximum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "250", weightKg = "65")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns false when height is 251 above maximum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "251", weightKg = "65")
        assertFalse(state.isComplete)
    }

    // ── isComplete weight boundary cases ────────────────────────────────

    @Test
    fun `isComplete returns false when weight is 9 below minimum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "9")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns true when weight is 10 at minimum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "10")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns true when weight is 300 at maximum boundary`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "300")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete returns false when weight is 301 above maximum`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "301")
        assertFalse(state.isComplete)
    }

    // ── isComplete with decimal values ───────────────────────────────────

    @Test
    fun `isComplete accepts decimal height within valid range`() {
        // 175.5 truncates to int 175, which is in 50..250
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "175.5", weightKg = "65")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete accepts decimal weight within valid range`() {
        // 70.2 truncates to int 70, which is in 10..300
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "70.2")
        assertTrue(state.isComplete)
    }

    @Test
    fun `isComplete accepts decimal height at boundary 49 point 9 is below 50`() {
        // 49.9 truncates to int 49, which is NOT in 50..250
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "49.9", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete accepts decimal weight at boundary 9 point 9 is below 10`() {
        // 9.9 truncates to int 9, which is NOT in 10..300
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "9.9")
        assertFalse(state.isComplete)
    }

    // ── isComplete with non-numeric values ───────────────────────────────

    @Test
    fun `isComplete returns false when age is non-numeric`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "abc", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when height is non-numeric`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "abc", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when weight is non-numeric`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "abc")
        assertFalse(state.isComplete)
    }

    // ── isComplete playerName edge cases ────────────────────────────────

    @Test
    fun `isComplete returns false when playerName is empty string`() {
        val state = ProfileSetupUiState(playerName = "", age = "25", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when playerName contains only spaces`() {
        val state = ProfileSetupUiState(playerName = "   ", age = "25", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete returns false when playerName contains only tab characters`() {
        val state = ProfileSetupUiState(playerName = "\t\t", age = "25", heightCm = "170", weightKg = "65")
        assertFalse(state.isComplete)
    }

    // ── ProfileSetupUiState data class contracts ─────────────────────────

    @Test
    fun `data class equality holds for identical instances`() {
        val a = ProfileSetupUiState("Alice", "25", "170", "65")
        val b = ProfileSetupUiState("Alice", "25", "170", "65")
        assertEquals(a, b)
    }

    @Test
    fun `data class equality fails for different instances`() {
        val a = ProfileSetupUiState("Alice", "25", "170", "65")
        val b = ProfileSetupUiState("Bob", "25", "170", "65")
        assertNotEquals(a, b)
    }

    @Test
    fun `toString contains all field values`() {
        val state = ProfileSetupUiState("Alice", "25", "170", "65")
        val str = state.toString()
        assertTrue(str.contains("Alice"))
        assertTrue(str.contains("25"))
        assertTrue(str.contains("170"))
        assertTrue(str.contains("65"))
    }

    @Test
    fun `hashCode is consistent for equal instances`() {
        val a = ProfileSetupUiState("Alice", "25", "170", "65")
        val b = ProfileSetupUiState("Alice", "25", "170", "65")
        assertEquals(a.hashCode(), b.hashCode())
    }

    @Test
    fun `copy with no changes produces equal instance`() {
        val original = ProfileSetupUiState("Alice", "25", "170", "65")
        val copy = original.copy()
        assertEquals(original, copy)
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
    fun `handles null playerName pref independently`() {
        every { prefs.getString("player_name", "") } returns null
        val vm = createViewModel()
        assertEquals("", vm.uiState.value.playerName)
    }

    @Test
    fun `handles null age pref independently`() {
        every { prefs.getString("age", "") } returns null
        val vm = createViewModel()
        assertEquals("", vm.uiState.value.age)
    }

    @Test
    fun `handles null heightCm pref independently`() {
        every { prefs.getString("height_cm", "") } returns null
        val vm = createViewModel()
        assertEquals("", vm.uiState.value.heightCm)
    }

    @Test
    fun `handles null weightKg pref independently`() {
        every { prefs.getString("weight_kg", "") } returns null
        val vm = createViewModel()
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

    @Test
    fun `init with complete valid prefs produces isComplete true`() {
        every { prefs.getString("player_name", "") } returns "Alice"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "170"
        every { prefs.getString("weight_kg", "") } returns "65"
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isComplete)
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

    @Test
    fun `updatePlayerName with spaces only makes isComplete false`() {
        val vm = createViewModel()
        vm.updatePlayerName("   ")
        assertFalse(vm.uiState.value.isComplete)
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

    @Test
    fun `updateAge auto-calculates max HR for valid age`() {
        val vm = createViewModel()
        vm.updateAge("30")
        verify { editor.putInt("max_hr", 190) }
    }

    @Test
    fun `updateAge auto-calculates max HR at boundary ages`() {
        val vm = createViewModel()
        vm.updateAge("5")
        verify { editor.putInt("max_hr", 215) }

        vm.updateAge("120")
        verify { editor.putInt("max_hr", 100) }
    }

    @Test
    fun `updateAge does not set max HR for invalid age`() {
        val vm = createViewModel()
        vm.updateAge("3")
        verify(exactly = 0) { editor.putInt("max_hr", any()) }
    }

    @Test
    fun `updateAge does not set max HR for age 4 below minimum`() {
        val vm = createViewModel()
        vm.updateAge("4")
        verify(exactly = 0) { editor.putInt("max_hr", any()) }
    }

    @Test
    fun `updateAge sets max HR for age 5 at minimum boundary`() {
        val vm = createViewModel()
        vm.updateAge("5")
        // 220 - 5 = 215
        verify(exactly = 1) { editor.putInt("max_hr", 215) }
    }

    @Test
    fun `updateAge sets max HR for age 120 at maximum boundary`() {
        val vm = createViewModel()
        vm.updateAge("120")
        // 220 - 120 = 100
        verify(exactly = 1) { editor.putInt("max_hr", 100) }
    }

    @Test
    fun `updateAge does not set max HR for age 121 above maximum`() {
        val vm = createViewModel()
        vm.updateAge("121")
        verify(exactly = 0) { editor.putInt("max_hr", any()) }
    }

    @Test
    fun `updateAge with purely non-digit input does not set max HR`() {
        val vm = createViewModel()
        vm.updateAge("abc")
        // filtered = "", which has no toIntOrNull(), so no maxHr write
        verify(exactly = 0) { editor.putInt("max_hr", any()) }
    }

    @Test
    fun `updateAge with mixed input filters and uses digit portion for maxHr`() {
        val vm = createViewModel()
        // "3a0" filters to "30", which is valid
        vm.updateAge("3a0")
        assertEquals("30", vm.uiState.value.age)
        verify { editor.putInt("max_hr", 190) }
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

    @Test
    fun `updateHeightCm allows multiple dots since filter only checks character type`() {
        // The filter passes any '.' character — "1..75" becomes "1..75" in state.
        // This reflects the actual implementation behaviour: no deduplication of dots.
        val vm = createViewModel()
        vm.updateHeightCm("1..75")
        assertEquals("1..75", vm.uiState.value.heightCm)
    }

    @Test
    fun `updateHeightCm with all letters produces empty string`() {
        val vm = createViewModel()
        vm.updateHeightCm("abcdef")
        assertEquals("", vm.uiState.value.heightCm)
    }

    @Test
    fun `updateHeightCm saves empty string when all chars filtered`() {
        val vm = createViewModel()
        vm.updateHeightCm("xyz")
        verify { editor.putString("height_cm", "") }
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

    @Test
    fun `updateWeightKg allows multiple dots since filter only checks character type`() {
        // Same filter behaviour as height: dots are passed through without deduplication.
        val vm = createViewModel()
        vm.updateWeightKg("7..0")
        assertEquals("7..0", vm.uiState.value.weightKg)
    }

    @Test
    fun `updateWeightKg with all letters produces empty string`() {
        val vm = createViewModel()
        vm.updateWeightKg("kg")
        assertEquals("", vm.uiState.value.weightKg)
    }

    @Test
    fun `updateWeightKg saves empty string when all chars filtered`() {
        val vm = createViewModel()
        vm.updateWeightKg("kg")
        verify { editor.putString("weight_kg", "") }
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

    @Test
    fun `isComplete becomes false after setting age out of range`() {
        every { prefs.getString("player_name", "") } returns "Alice"
        every { prefs.getString("age", "") } returns "25"
        every { prefs.getString("height_cm", "") } returns "170"
        every { prefs.getString("weight_kg", "") } returns "65"
        val vm = createViewModel()
        assertTrue(vm.uiState.value.isComplete)
        // "200" digits pass through filter but 200 > 120 so isComplete goes false
        vm.updateAge("200")
        assertFalse(vm.uiState.value.isComplete)
    }

    @Test
    fun `isComplete false when all fields present but height out of range`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "300", weightKg = "65")
        assertFalse(state.isComplete)
    }

    @Test
    fun `isComplete false when all fields present but weight out of range`() {
        val state = ProfileSetupUiState(playerName = "Alice", age = "25", heightCm = "170", weightKg = "400")
        assertFalse(state.isComplete)
    }
}
