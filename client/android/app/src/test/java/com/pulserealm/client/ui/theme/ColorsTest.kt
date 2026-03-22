package com.pulserealm.client.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class PulseColorsTest {

    @Test
    fun `Cyan is correct hex value`() {
        assertEquals(Color(0xFF38BDF8), PulseColors.Cyan)
    }

    @Test
    fun `DarkSurface is correct hex value`() {
        assertEquals(Color(0xFF1E293B), PulseColors.DarkSurface)
    }

    @Test
    fun `Red is correct hex value`() {
        assertEquals(Color(0xFFF87171), PulseColors.Red)
    }

    @Test
    fun `BrightRed is correct hex value`() {
        assertEquals(Color(0xFFEF4444), PulseColors.BrightRed)
    }

    @Test
    fun `Green is correct hex value`() {
        assertEquals(Color(0xFF34D399), PulseColors.Green)
    }

    @Test
    fun `Yellow is correct hex value`() {
        assertEquals(Color(0xFFFBBF24), PulseColors.Yellow)
    }

    @Test
    fun `Purple is correct hex value`() {
        assertEquals(Color(0xFFA78BFA), PulseColors.Purple)
    }

    @Test
    fun `all colors are non-transparent`() {
        val colors = listOf(
            PulseColors.Cyan, PulseColors.DarkSurface, PulseColors.MutedText,
            PulseColors.DimText, PulseColors.DarkestText, PulseColors.Red,
            PulseColors.BrightRed, PulseColors.ErrorText, PulseColors.Green,
            PulseColors.DarkGreen, PulseColors.LightGreen, PulseColors.Yellow,
            PulseColors.Purple, PulseColors.Teal, PulseColors.BrightGreen,
            PulseColors.Amber
        )
        for (color in colors) {
            assertTrue("Color $color should have full alpha", color.alpha >= 0.99f)
        }
    }

    @Test
    fun `ErrorBg has partial transparency`() {
        assertTrue(PulseColors.ErrorBg.alpha < 1.0f)
        assertTrue(PulseColors.ErrorBg.alpha > 0.5f)
    }
}
