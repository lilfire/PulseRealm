package com.pulserealm.client.ui.session

import android.app.Application
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.sensor.SensorDataCollector
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RealmViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var application: Application
    private lateinit var signalRClient: SignalRClient
    private lateinit var sensorDataCollector: SensorDataCollector
    private lateinit var savedStateHandle: SavedStateHandle

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        application = mockk(relaxed = true)
        signalRClient = mockk(relaxed = true)
        sensorDataCollector = mockk(relaxed = true)

        every { signalRClient.connectionState } returns MutableStateFlow(ConnectionState.CONNECTED)
        every { signalRClient.realmEnded } returns MutableStateFlow(null)
        every { signalRClient.eliminated } returns MutableStateFlow(false)
        every { sensorDataCollector.heartRate } returns MutableStateFlow(120)
        every { sensorDataCollector.steps } returns MutableStateFlow(500)
        every { sensorDataCollector.sensorsAvailable } returns MutableStateFlow(true)

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
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals("realm-abc", viewModel.realmId)
    }

    @Test
    fun `clientId is extracted from SavedStateHandle`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals("wear-test1234", viewModel.clientId)
    }

    @Test
    fun `serverUrl is URL-decoded from SavedStateHandle`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `serverUrl handles non-encoded value`() {
        val handle = SavedStateHandle(mapOf(
            "realmId" to "r1",
            "clientId" to "c1",
            "serverUrl" to "http://192.168.1.100:5062"
        ))
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, handle)
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `missing realmId defaults to empty string`() {
        val handle = SavedStateHandle(mapOf(
            "clientId" to "c1",
            "serverUrl" to "url"
        ))
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, handle)
        assertEquals("", viewModel.realmId)
    }

    @Test
    fun `heartRate flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals(120, viewModel.heartRate.value)
    }

    @Test
    fun `steps flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals(500, viewModel.steps.value)
    }

    @Test
    fun `sensorsAvailable flow comes from sensor collector`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertTrue(viewModel.sensorsAvailable.value)
    }

    @Test
    fun `connectionState flow comes from signalR client`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        assertEquals(ConnectionState.CONNECTED, viewModel.connectionState.value)
    }

    @Test
    fun `startStreaming launches foreground service`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.startStreaming()

        verify { application.startForegroundService(any()) }
    }

    @Test
    fun `startStreaming is idempotent`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.startStreaming()
        viewModel.startStreaming()

        // Only one service start call
        verify(exactly = 1) { application.startForegroundService(any()) }
    }

    @Test
    fun `stopStreaming stops the service`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.startStreaming()
        viewModel.stopStreaming()

        verify { application.stopService(any()) }
    }

    @Test
    fun `stopStreaming without startStreaming is no-op`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.stopStreaming()

        verify(exactly = 0) { application.stopService(any()) }
    }

    @Test
    fun `disconnect stops streaming and disconnects signalR`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.startStreaming()
        viewModel.disconnect()

        verify { application.stopService(any()) }
        verify { signalRClient.disconnect() }
    }

    @Test
    fun `disconnect without streaming only disconnects signalR`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.disconnect()

        verify(exactly = 0) { application.stopService(any()) }
        verify { signalRClient.disconnect() }
    }

    @Test
    fun `onCleared calls disconnect`() {
        val viewModel = RealmViewModel(application, signalRClient, sensorDataCollector, savedStateHandle)
        viewModel.startStreaming()

        // Simulate onCleared via reflection since it's protected
        val method = RealmViewModel::class.java.getDeclaredMethod("onCleared")
        method.isAccessible = true
        method.invoke(viewModel)

        verify { signalRClient.disconnect() }
    }
}
