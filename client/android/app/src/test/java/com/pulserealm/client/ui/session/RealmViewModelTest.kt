package com.pulserealm.client.ui.session

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import android.os.PowerManager
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@OptIn(ExperimentalCoroutinesApi::class)
class RealmViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var application: Application
    private lateinit var signalRClient: SignalRClient
    private lateinit var sensorDataCollector: SensorDataCollector
    private lateinit var prefs: SharedPreferences
    private lateinit var savedStateHandle: SavedStateHandle

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        application = mockk(relaxed = true)
        val powerManager = mockk<PowerManager>(relaxed = true)
        every { application.getSystemService(Context.POWER_SERVICE) } returns powerManager
        signalRClient = mockk(relaxed = true)
        sensorDataCollector = mockk(relaxed = true)
        prefs = mockk(relaxed = true)

        every { signalRClient.connectionState } returns MutableStateFlow(ConnectionState.CONNECTED)
        every { signalRClient.realmEnded } returns MutableStateFlow(null)
        every { signalRClient.eliminated } returns MutableStateFlow(false)
        every { signalRClient.realmStarted } returns MutableStateFlow(false)
        every { signalRClient.bindRequest } returns MutableStateFlow(null)
        every { signalRClient.calibrationSessionId } returns MutableStateFlow(null)
        every { signalRClient.calibrationComplete } returns MutableStateFlow(null)
        every { sensorDataCollector.heartRate } returns MutableStateFlow(120)
        every { sensorDataCollector.steps } returns MutableStateFlow(500)
        every { sensorDataCollector.sensorsAvailable } returns MutableStateFlow(true)

        every { prefs.getString("height_cm", null) } returns "175"
        every { prefs.getString("weight_kg", null) } returns "70"
        every { prefs.getString("age", null) } returns "25"
        every { prefs.getString("stride_calibration", null) } returns null

        savedStateHandle = SavedStateHandle(mapOf(
            "realmId" to "realm-abc",
            "clientId" to "wear-test1234",
            "serverUrl" to "http%3A%2F%2F192.168.1.100%3A5062"
        ))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `realmId is extracted from SavedStateHandle`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals("realm-abc", viewModel.realmId)
    }

    @Test
    fun `clientId is extracted from SavedStateHandle`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals("wear-test1234", viewModel.clientId)
    }

    @Test
    fun `serverUrl is URL-decoded from SavedStateHandle`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `serverUrl handles non-encoded value`() {
        val handle = SavedStateHandle(mapOf(
            "realmId" to "r1",
            "clientId" to "c1",
            "serverUrl" to "http://192.168.1.100:5062"
        ))
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, handle)
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `missing realmId defaults to empty string`() {
        val handle = SavedStateHandle(mapOf(
            "clientId" to "c1",
            "serverUrl" to "url"
        ))
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, handle)
        assertEquals("", viewModel.realmId)
    }

    @Test
    fun `heartRate flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals(120, viewModel.heartRate.value)
    }

    @Test
    fun `steps flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals(500, viewModel.steps.value)
    }

    @Test
    fun `sensorsAvailable flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertTrue(viewModel.sensorsAvailable.value)
    }

    @Test
    fun `connectionState flow comes from signalR client`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        assertEquals(ConnectionState.CONNECTED, viewModel.connectionState.value)
    }

    @Test
    fun `startStreaming launches foreground service`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.startStreaming()

        verify { application.startForegroundService(any()) }
    }

    @Test
    fun `startStreaming is idempotent`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.startStreaming()
        viewModel.startStreaming()

        // Only one service start call
        verify(exactly = 1) { application.startForegroundService(any()) }
    }

    @Test
    fun `stopStreaming stops the service`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.startStreaming()
        viewModel.stopStreaming()

        verify { application.stopService(any()) }
    }

    @Test
    fun `stopStreaming without startStreaming is no-op`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.stopStreaming()

        verify(exactly = 0) { application.stopService(any()) }
    }

    @Test
    fun `disconnect stops streaming and disconnects signalR`() = runTest(testDispatcher) {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.startStreaming()
        viewModel.disconnect()
        advanceUntilIdle()

        verify { application.stopService(any()) }
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `disconnect without streaming only disconnects signalR`() = runTest(testDispatcher) {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.disconnect()
        advanceUntilIdle()

        verify(exactly = 0) { application.stopService(any()) }
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `onCleared calls disconnect`() = runTest(testDispatcher) {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, prefs, savedStateHandle)
        viewModel.startStreaming()

        // Simulate onCleared via reflection since it's protected
        val method = RealmViewModel::class.java.getDeclaredMethod("onCleared")
        method.isAccessible = true
        method.invoke(viewModel)
        advanceUntilIdle()

        coVerify { signalRClient.disconnect() }
    }
}
