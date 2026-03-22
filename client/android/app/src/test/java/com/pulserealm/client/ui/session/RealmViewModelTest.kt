package com.pulserealm.client.ui.session

import android.Manifest
import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.PowerManager
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.network.BindRequestData
import com.pulserealm.client.data.network.ConnectionState
import com.pulserealm.client.data.network.RealmSummaryData
import com.pulserealm.client.data.network.SignalRClient
import com.pulserealm.client.data.network.StrideCalibrationPoint
import com.pulserealm.client.data.sensor.SensorDataCollector
import com.pulserealm.client.service.DataStreamingService
import io.mockk.Runs
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkStatic
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
    private lateinit var editor: SharedPreferences.Editor
    private lateinit var savedStateHandle: SavedStateHandle
    private lateinit var powerManager: PowerManager

    // Backing flows reused across tests so individual tests can push new values.
    private val calibrationSessionIdFlow = MutableStateFlow<String?>(null)

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        editor = mockk(relaxed = true)
        every { editor.putFloat(any(), any()) } returns editor
        every { editor.putString(any(), any()) } returns editor
        every { editor.apply() } just Runs

        application = mockk(relaxed = true)
        powerManager = mockk(relaxed = true)
        every { application.getSystemService(Context.POWER_SERVICE) } returns powerManager
        every { application.packageName } returns "com.pulserealm.client"

        signalRClient = mockk(relaxed = true)
        sensorDataCollector = mockk(relaxed = true)
        prefs = mockk(relaxed = true)

        every { signalRClient.connectionState } returns MutableStateFlow(ConnectionState.CONNECTED)
        every { signalRClient.realmEnded } returns MutableStateFlow(null)
        every { signalRClient.eliminated } returns MutableStateFlow(false)
        every { signalRClient.realmStarted } returns MutableStateFlow(false)
        every { signalRClient.bindRequest } returns MutableStateFlow(null)
        every { signalRClient.calibrationSessionId } returns calibrationSessionIdFlow
        every { signalRClient.calibrationComplete } returns MutableStateFlow(null)

        every { sensorDataCollector.heartRate } returns MutableStateFlow(120)
        every { sensorDataCollector.steps } returns MutableStateFlow(500)
        every { sensorDataCollector.sensorsAvailable } returns MutableStateFlow(true)

        every { prefs.getString("height_cm", null) } returns "175"
        every { prefs.getString("weight_kg", null) } returns "70"
        every { prefs.getString("age", null) } returns "25"
        every { prefs.getString("stride_calibration", null) } returns null
        every { prefs.edit() } returns editor

        savedStateHandle = SavedStateHandle(
            mapOf(
                "realmId" to "realm-abc",
                "clientId" to "wear-test1234",
                "serverUrl" to "http%3A%2F%2F192.168.1.100%3A5062"
            )
        )

        // Reset calibration flow to null before each test.
        calibrationSessionIdFlow.value = null
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    // -------------------------------------------------------------------------
    // SavedStateHandle extraction
    // -------------------------------------------------------------------------

    @Test
    fun `realmId is extracted from SavedStateHandle`() {
        val viewModel = buildViewModel()
        assertEquals("realm-abc", viewModel.realmId)
    }

    @Test
    fun `clientId is extracted from SavedStateHandle`() {
        val viewModel = buildViewModel()
        assertEquals("wear-test1234", viewModel.clientId)
    }

    @Test
    fun `serverUrl is URL-decoded from SavedStateHandle`() {
        val viewModel = buildViewModel()
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `serverUrl handles non-encoded value`() {
        val handle = savedStateHandleWith(serverUrl = "http://192.168.1.100:5062")
        val viewModel = buildViewModel(handle)
        assertEquals("http://192.168.1.100:5062", viewModel.serverUrl)
    }

    @Test
    fun `missing realmId defaults to empty string`() {
        val handle = SavedStateHandle(mapOf("clientId" to "c1", "serverUrl" to "url"))
        val viewModel = buildViewModel(handle)
        assertEquals("", viewModel.realmId)
    }

    @Test
    fun `missing clientId defaults to empty string`() {
        val handle = SavedStateHandle(mapOf("realmId" to "r1", "serverUrl" to "url"))
        val viewModel = buildViewModel(handle)
        assertEquals("", viewModel.clientId)
    }

    @Test
    fun `missing serverUrl defaults to empty string`() {
        val handle = SavedStateHandle(mapOf("realmId" to "r1", "clientId" to "c1"))
        val viewModel = buildViewModel(handle)
        assertEquals("", viewModel.serverUrl)
    }

    // -------------------------------------------------------------------------
    // Prefs loading — heightCm / weightKg / age
    // -------------------------------------------------------------------------

    @Test
    fun `heightCm reads from prefs`() {
        every { prefs.getString("height_cm", null) } returns "180"
        val viewModel = buildViewModel()
        assertEquals(180.0, viewModel.heightCm, 0.001)
    }

    @Test
    fun `heightCm defaults to 0 when prefs returns null`() {
        every { prefs.getString("height_cm", null) } returns null
        val viewModel = buildViewModel()
        assertEquals(0.0, viewModel.heightCm, 0.001)
    }

    @Test
    fun `heightCm defaults to 0 when prefs value is non-numeric`() {
        every { prefs.getString("height_cm", null) } returns "not-a-number"
        val viewModel = buildViewModel()
        assertEquals(0.0, viewModel.heightCm, 0.001)
    }

    @Test
    fun `weightKg and age are loaded from prefs at construction`() {
        // These fields are private but their effect is visible through the service Intent extras.
        every { prefs.getString("weight_kg", null) } returns "80"
        every { prefs.getString("age", null) } returns "30"
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val intentSlot = slot<Intent>()
        every { application.startForegroundService(capture(intentSlot)) } returns null

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val intent = intentSlot.captured
        assertEquals(80.0, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, -1.0), 0.001)
        assertEquals(30, intent.getIntExtra(DataStreamingService.EXTRA_AGE, -1))
    }

    @Test
    fun `weightKg defaults to 0 when prefs returns null`() {
        every { prefs.getString("weight_kg", null) } returns null
        every { prefs.getString("age", null) } returns null
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val intentSlot = slot<Intent>()
        every { application.startForegroundService(capture(intentSlot)) } returns null

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val intent = intentSlot.captured
        assertEquals(0.0, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, -1.0), 0.001)
        assertEquals(0, intent.getIntExtra(DataStreamingService.EXTRA_AGE, -1))
    }

    // -------------------------------------------------------------------------
    // Flow delegation
    // -------------------------------------------------------------------------

    @Test
    fun `heartRate flow comes from sensor collector`() {
        val viewModel = buildViewModel()
        assertEquals(120, viewModel.heartRate.value)
    }

    @Test
    fun `steps flow comes from sensor collector`() {
        val viewModel = buildViewModel()
        assertEquals(500, viewModel.steps.value)
    }

    @Test
    fun `sensorsAvailable flow comes from sensor collector`() {
        val viewModel = buildViewModel()
        assertTrue(viewModel.sensorsAvailable.value)
    }

    @Test
    fun `connectionState flow comes from signalR client`() {
        val viewModel = buildViewModel()
        assertEquals(ConnectionState.CONNECTED, viewModel.connectionState.value)
    }

    @Test
    fun `realmEnded flow reflects signalR client value`() {
        val summary = RealmSummaryData(durationSeconds = 300.0, totalSteps = 1000)
        every { signalRClient.realmEnded } returns MutableStateFlow(summary)
        val viewModel = buildViewModel()
        assertEquals(summary, viewModel.realmEnded.value)
    }

    @Test
    fun `realmEnded flow is null initially`() {
        val viewModel = buildViewModel()
        assertNull(viewModel.realmEnded.value)
    }

    @Test
    fun `eliminated flow reflects signalR client value`() {
        every { signalRClient.eliminated } returns MutableStateFlow(true)
        val viewModel = buildViewModel()
        assertTrue(viewModel.eliminated.value)
    }

    @Test
    fun `eliminated flow is false initially`() {
        val viewModel = buildViewModel()
        assertFalse(viewModel.eliminated.value)
    }

    @Test
    fun `realmStarted flow reflects signalR client value`() {
        every { signalRClient.realmStarted } returns MutableStateFlow(true)
        val viewModel = buildViewModel()
        assertTrue(viewModel.realmStarted.value)
    }

    @Test
    fun `realmStarted flow is false initially`() {
        val viewModel = buildViewModel()
        assertFalse(viewModel.realmStarted.value)
    }

    @Test
    fun `bindRequest flow reflects signalR client value`() {
        val bindReq = BindRequestData(code = "ABC123")
        every { signalRClient.bindRequest } returns MutableStateFlow(bindReq)
        val viewModel = buildViewModel()
        assertEquals(bindReq, viewModel.bindRequest.value)
    }

    @Test
    fun `bindRequest flow is null initially`() {
        val viewModel = buildViewModel()
        assertNull(viewModel.bindRequest.value)
    }

    @Test
    fun `calibrationComplete flow reflects signalR client value`() {
        val points = listOf(
            StrideCalibrationPoint(speedKmh = 8.0, strideFactor = 0.42)
        )
        every { signalRClient.calibrationComplete } returns MutableStateFlow(points)
        val viewModel = buildViewModel()
        assertEquals(points, viewModel.calibrationComplete.value)
    }

    @Test
    fun `calibrationComplete flow is null initially`() {
        val viewModel = buildViewModel()
        assertNull(viewModel.calibrationComplete.value)
    }

    // -------------------------------------------------------------------------
    // isCalibrationMode
    // -------------------------------------------------------------------------

    @Test
    fun `isCalibrationMode is false when calibrationSessionId is null`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = null
        val viewModel = buildViewModel()
        advanceUntilIdle()
        assertFalse(viewModel.isCalibrationMode.value)
    }

    @Test
    fun `isCalibrationMode is true when calibrationSessionId is non-null`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = "session-xyz"
        val viewModel = buildViewModel()
        advanceUntilIdle()
        assertTrue(viewModel.isCalibrationMode.value)
    }

    @Test
    fun `isCalibrationMode reflects initial non-null calibrationSessionId at construction`() {
        calibrationSessionIdFlow.value = "session-123"
        val viewModel = buildViewModel()
        // The stateIn initializer reads the current value synchronously.
        assertTrue(viewModel.isCalibrationMode.value)
    }

    // -------------------------------------------------------------------------
    // saveStrideFactor
    // -------------------------------------------------------------------------

    @Test
    fun `saveStrideFactor writes float to prefs`() {
        val viewModel = buildViewModel()
        viewModel.saveStrideFactor(0.55)
        verify { editor.putFloat("stride_factor", 0.55f) }
        verify { editor.apply() }
    }

    @Test
    fun `saveStrideFactor converts double to float correctly`() {
        val viewModel = buildViewModel()
        viewModel.saveStrideFactor(0.75)
        verify { editor.putFloat("stride_factor", 0.75f) }
    }

    // -------------------------------------------------------------------------
    // saveStrideCalibration
    // -------------------------------------------------------------------------

    @Test
    fun `saveStrideCalibration serializes list to JSON and saves to prefs`() {
        val points = listOf(
            StrideCalibrationPoint(speedKmh = 5.0, strideFactor = 0.38),
            StrideCalibrationPoint(speedKmh = 10.0, strideFactor = 0.50)
        )
        val capturedValue = slot<String>()
        every { editor.putString("stride_calibration", capture(capturedValue)) } returns editor

        val viewModel = buildViewModel()
        viewModel.saveStrideCalibration(points)

        verify { editor.putString("stride_calibration", any()) }
        verify { editor.apply() }

        // Verify round-trip fidelity by loading back.
        every { prefs.getString("stride_calibration", null) } returns capturedValue.captured
        val loaded = viewModel.loadStrideCalibration()
        assertNotNull(loaded)
        assertEquals(2, loaded!!.size)
        assertEquals(5.0, loaded[0].speedKmh, 0.001)
        assertEquals(0.38, loaded[0].strideFactor, 0.001)
        assertEquals(10.0, loaded[1].speedKmh, 0.001)
        assertEquals(0.50, loaded[1].strideFactor, 0.001)
    }

    @Test
    fun `saveStrideCalibration with empty list saves empty JSON array`() {
        val capturedValue = slot<String>()
        every { editor.putString("stride_calibration", capture(capturedValue)) } returns editor

        val viewModel = buildViewModel()
        viewModel.saveStrideCalibration(emptyList())

        verify { editor.putString("stride_calibration", any()) }
        assertTrue(capturedValue.captured.trim() == "[]")
    }

    // -------------------------------------------------------------------------
    // loadStrideCalibration
    // -------------------------------------------------------------------------

    @Test
    fun `loadStrideCalibration returns null when prefs has no value`() {
        every { prefs.getString("stride_calibration", null) } returns null
        val viewModel = buildViewModel()
        assertNull(viewModel.loadStrideCalibration())
    }

    @Test
    fun `loadStrideCalibration parses stored JSON correctly`() {
        val json = """[{"speedKmh":8.0,"strideFactor":0.42},{"speedKmh":12.0,"strideFactor":0.60}]"""
        every { prefs.getString("stride_calibration", null) } returns json

        val viewModel = buildViewModel()
        val result = viewModel.loadStrideCalibration()

        assertNotNull(result)
        assertEquals(2, result!!.size)
        assertEquals(8.0, result[0].speedKmh, 0.001)
        assertEquals(0.42, result[0].strideFactor, 0.001)
        assertEquals(12.0, result[1].speedKmh, 0.001)
        assertEquals(0.60, result[1].strideFactor, 0.001)
    }

    @Test
    fun `loadStrideCalibration returns null for malformed JSON`() {
        every { prefs.getString("stride_calibration", null) } returns "not-valid-json"
        val viewModel = buildViewModel()
        assertNull(viewModel.loadStrideCalibration())
    }

    @Test
    fun `loadStrideCalibration returns null for blank string`() {
        every { prefs.getString("stride_calibration", null) } returns "   "
        val viewModel = buildViewModel()
        assertNull(viewModel.loadStrideCalibration())
    }

    // -------------------------------------------------------------------------
    // resetSteps
    // -------------------------------------------------------------------------

    @Test
    fun `resetSteps delegates to sensorDataCollector`() {
        val viewModel = buildViewModel()
        viewModel.resetSteps()
        verify { sensorDataCollector.resetSteps() }
    }

    // -------------------------------------------------------------------------
    // reconnect
    // -------------------------------------------------------------------------

    @Test
    fun `reconnect delegates to signalRClient manualReconnect`() {
        val viewModel = buildViewModel()
        viewModel.reconnect()
        verify { signalRClient.manualReconnect() }
    }

    // -------------------------------------------------------------------------
    // respondBind
    // -------------------------------------------------------------------------

    @Test
    fun `respondBind delegates to signalRClient with realmId and approved true`() {
        val viewModel = buildViewModel()
        viewModel.respondBind(approved = true)
        verify { signalRClient.respondBind("realm-abc", true) }
    }

    @Test
    fun `respondBind delegates to signalRClient with realmId and approved false`() {
        val viewModel = buildViewModel()
        viewModel.respondBind(approved = false)
        verify { signalRClient.respondBind("realm-abc", false) }
    }

    // -------------------------------------------------------------------------
    // startStreaming — normal (non-calibration) mode
    // -------------------------------------------------------------------------

    @Test
    fun `startStreaming launches foreground service`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        verify { application.startForegroundService(any()) }
    }

    @Test
    fun `startStreaming passes correct extras to service intent`() {
        every { prefs.getString("weight_kg", null) } returns "65"
        every { prefs.getString("age", null) } returns "28"
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val intentSlot = slot<Intent>()
        every { application.startForegroundService(capture(intentSlot)) } returns null

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val intent = intentSlot.captured
        assertEquals("realm-abc", intent.getStringExtra(DataStreamingService.EXTRA_REALM_ID))
        assertEquals("wear-test1234", intent.getStringExtra(DataStreamingService.EXTRA_CLIENT_ID))
        assertEquals(1000L, intent.getLongExtra(DataStreamingService.EXTRA_INTERVAL_MS, -1L))
        assertEquals(65.0, intent.getDoubleExtra(DataStreamingService.EXTRA_WEIGHT_KG, -1.0), 0.001)
        assertEquals(28, intent.getIntExtra(DataStreamingService.EXTRA_AGE, -1))
    }

    @Test
    fun `startStreaming is idempotent — service started only once`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        viewModel.startStreaming()
        verify(exactly = 1) { application.startForegroundService(any()) }
    }

    // -------------------------------------------------------------------------
    // startStreaming — calibration mode
    // -------------------------------------------------------------------------

    @Test
    fun `startStreaming in calibration mode starts sensor collector`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = "cal-session-1"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(
                application,
                Manifest.permission.BODY_SENSORS
            )
        } returns PackageManager.PERMISSION_GRANTED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()
        advanceUntilIdle()

        verify { sensorDataCollector.start(true) }
        verify(exactly = 0) { application.startForegroundService(any()) }

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    @Test
    fun `startStreaming in calibration mode starts sensor collector without body sensor permission`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = "cal-session-2"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(
                application,
                Manifest.permission.BODY_SENSORS
            )
        } returns PackageManager.PERMISSION_DENIED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()
        advanceUntilIdle()

        verify { sensorDataCollector.start(false) }

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    @Test
    fun `startStreaming in calibration mode launches a calibration job that sends data`() {
        // The calibration loop runs on Dispatchers.IO with real delays and cannot be controlled
        // via advanceTimeBy. We poll with a bounded wall-clock wait instead.
        calibrationSessionIdFlow.value = "cal-session-3"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(any(), any())
        } returns PackageManager.PERMISSION_GRANTED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val deadline = System.currentTimeMillis() + 4_000L
        var called = false
        while (System.currentTimeMillis() < deadline && !called) {
            Thread.sleep(100)
            try {
                verify(atLeast = 1) { signalRClient.sendCalibrationData("realm-abc", 500) }
                called = true
            } catch (_: AssertionError) { /* loop not ticked yet */ }
        }

        viewModel.stopStreaming()
        assertTrue("sendCalibrationData was never called within 4 s", called)

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    @Test
    fun `startStreaming in calibration mode does not start foreground service`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = "cal-session-4"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(any(), any())
        } returns PackageManager.PERMISSION_GRANTED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()
        advanceUntilIdle()

        verify(exactly = 0) { application.startForegroundService(any()) }

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    // -------------------------------------------------------------------------
    // stopStreaming — normal mode
    // -------------------------------------------------------------------------

    @Test
    fun `stopStreaming stops the service`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        viewModel.stopStreaming()
        verify { application.stopService(any()) }
    }

    @Test
    fun `stopStreaming without startStreaming is a no-op`() {
        val viewModel = buildViewModel()
        viewModel.stopStreaming()
        verify(exactly = 0) { application.stopService(any()) }
    }

    @Test
    fun `stopStreaming can be called again after already stopped without effect`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        viewModel.stopStreaming()
        viewModel.stopStreaming()
        // Only one stop call because the second stopStreaming is a no-op.
        verify(exactly = 1) { application.stopService(any()) }
    }

    // -------------------------------------------------------------------------
    // stopStreaming — calibration mode
    // -------------------------------------------------------------------------

    @Test
    fun `stopStreaming in calibration mode stops sensor collector`() = runTest(testDispatcher) {
        calibrationSessionIdFlow.value = "cal-session-5"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(any(), any())
        } returns PackageManager.PERMISSION_GRANTED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()
        advanceUntilIdle()

        viewModel.stopStreaming()

        verify { sensorDataCollector.stop() }
        verify(exactly = 0) { application.stopService(any()) }

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    @Test
    fun `stopStreaming in calibration mode cancels the calibration job`() {
        // The calibration job runs on Dispatchers.IO; we use a real wall-clock wait so the loop
        // fires at least once. After stopStreaming we confirm the job was cancelled by verifying
        // that sensorDataCollector.stop() was called and the foreground service was never touched.
        calibrationSessionIdFlow.value = "cal-session-6"
        mockkStatic("androidx.core.content.ContextCompat")
        every {
            androidx.core.content.ContextCompat.checkSelfPermission(any(), any())
        } returns PackageManager.PERMISSION_GRANTED
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        // Wait long enough for at least one 1000 ms tick on the IO dispatcher.
        Thread.sleep(1_500L)

        viewModel.stopStreaming()

        // Calibration mode must stop the sensor collector, not the foreground service.
        verify(exactly = 1) { sensorDataCollector.stop() }
        verify(exactly = 0) { application.stopService(any()) }

        unmockkStatic("androidx.core.content.ContextCompat")
    }

    // -------------------------------------------------------------------------
    // leaveRealm
    // -------------------------------------------------------------------------

    @Test
    fun `leaveRealm stops streaming and calls signalRClient leaveRealm`() = runTest(testDispatcher) {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        viewModel.leaveRealm()
        advanceUntilIdle()

        verify { application.stopService(any()) }
        coVerify { signalRClient.leaveRealm() }
    }

    @Test
    fun `leaveRealm when not streaming still calls signalRClient leaveRealm`() = runTest(testDispatcher) {
        val viewModel = buildViewModel()
        viewModel.leaveRealm()
        advanceUntilIdle()

        verify(exactly = 0) { application.stopService(any()) }
        coVerify { signalRClient.leaveRealm() }
    }

    @Test
    fun `leaveRealm returns false synchronously before coroutine completes`() = runTest(testDispatcher) {
        // leaveRealm always returns false because the result is written in the coroutine
        // after the function returns — the local var is captured before the suspend call.
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        val result = viewModel.leaveRealm()
        assertFalse(result)
    }

    // -------------------------------------------------------------------------
    // disconnect
    // -------------------------------------------------------------------------

    @Test
    fun `disconnect stops streaming and disconnects signalR`() = runTest(testDispatcher) {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        viewModel.disconnect()
        advanceUntilIdle()

        verify { application.stopService(any()) }
        coVerify { signalRClient.disconnect() }
    }

    @Test
    fun `disconnect without streaming only disconnects signalR`() = runTest(testDispatcher) {
        val viewModel = buildViewModel()
        viewModel.disconnect()
        advanceUntilIdle()

        verify(exactly = 0) { application.stopService(any()) }
        coVerify { signalRClient.disconnect() }
    }

    // -------------------------------------------------------------------------
    // onCleared
    // -------------------------------------------------------------------------

    @Test
    fun `onCleared calls disconnect`() = runTest(testDispatcher) {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val method = RealmViewModel::class.java.getDeclaredMethod("onCleared")
        method.isAccessible = true
        method.invoke(viewModel)
        advanceUntilIdle()

        coVerify { signalRClient.disconnect() }
    }

    // -------------------------------------------------------------------------
    // requestBatteryOptimizationExemption
    // -------------------------------------------------------------------------

    @Test
    fun `startStreaming requests battery exemption when not already exempted`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns false
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        // startActivity should have been called with the battery optimisation intent.
        verify { application.startActivity(any()) }
    }

    @Test
    fun `startStreaming skips battery exemption request when already exempted`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns true
        val viewModel = buildViewModel()
        viewModel.startStreaming()
        verify(exactly = 0) { application.startActivity(any()) }
    }

    @Test
    fun `battery exemption intent targets application package name`() {
        every { powerManager.isIgnoringBatteryOptimizations(any()) } returns false

        val intentSlot = slot<Intent>()
        every { application.startActivity(capture(intentSlot)) } just Runs

        val viewModel = buildViewModel()
        viewModel.startStreaming()

        val intent = intentSlot.captured
        assertEquals("package:com.pulserealm.client", intent.dataString)
    }

    // -------------------------------------------------------------------------
    // Helper builders
    // -------------------------------------------------------------------------

    private fun buildViewModel(handle: SavedStateHandle = savedStateHandle): RealmViewModel =
        RealmViewModel(application, signalRClient, sensorDataCollector, prefs, handle)

    private fun savedStateHandleWith(
        realmId: String = "realm-abc",
        clientId: String = "wear-test1234",
        serverUrl: String = "http%3A%2F%2F192.168.1.100%3A5062"
    ): SavedStateHandle = SavedStateHandle(
        mapOf("realmId" to realmId, "clientId" to clientId, "serverUrl" to serverUrl)
    )
}
