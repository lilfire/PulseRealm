package com.pulserealm.client.ui.server

import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import com.pulserealm.client.data.network.DiscoveredServer
import com.pulserealm.client.data.network.ServerDiscoveryClient
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
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.InetAddress

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@OptIn(ExperimentalCoroutinesApi::class)
class ServerViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var prefs: SharedPreferences
    private lateinit var editor: SharedPreferences.Editor
    private lateinit var discoveryClient: ServerDiscoveryClient

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        editor = mockk(relaxed = true)
        every { editor.putString(any(), any()) } returns editor

        prefs = mockk(relaxed = true)
        every { prefs.edit() } returns editor
        every { prefs.getString("connection_mode", "remote") } returns "remote"
        every { prefs.getString("remote_server_url", "") } returns ""
        every { prefs.getString("cached_server_url", null) } returns null

        discoveryClient = mockk(relaxed = true)
        every { discoveryClient.discoveredServers } returns MutableStateFlow(emptyList())
        every { discoveryClient.isScanning } returns MutableStateFlow(false)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(
        skipAutoConnect: Boolean = false,
        mockConn: HttpURLConnection? = null
    ): ServerViewModel {
        val savedStateHandle = SavedStateHandle(
            if (skipAutoConnect) mapOf("skipAutoConnect" to true) else emptyMap()
        )
        return ServerViewModel(prefs, discoveryClient, savedStateHandle).also { vm ->
            vm.ioDispatcher = testDispatcher
            if (mockConn != null) {
                vm.openConnection = { mockConn }
            }
        }
    }

    private fun mockHttpConnection(responseCode: Int, body: String? = null): HttpURLConnection {
        val conn = mockk<HttpURLConnection>(relaxed = true)
        every { conn.responseCode } returns responseCode
        if (body != null) {
            every { conn.inputStream } answers { ByteArrayInputStream(body.toByteArray()) }
        }
        return conn
    }

    // ── ServerUiState data class ────────────────────────────────────────

    @Test
    fun `ServerUiState default values are correct`() {
        val state = ServerUiState()
        assertEquals("", state.serverUrl)
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertFalse(state.showManualEntry)
        assertEquals(ConnectionMode.LOCAL, state.connectionMode)
        assertEquals("", state.remoteUrl)
        assertFalse(state.isVerifyingServer)
        assertFalse(state.isConnected)
    }

    @Test
    fun `ServerUiState copy preserves fields`() {
        val original = ServerUiState(serverUrl = "http://test:5062", isConnected = true)
        val copy = original.copy(isLoading = true)
        assertEquals("http://test:5062", copy.serverUrl)
        assertTrue(copy.isConnected)
        assertTrue(copy.isLoading)
    }

    // ── Init: default REMOTE mode ──────────────────────────────────────

    @Test
    fun `init default REMOTE mode prefills default URL and verifies`() {
        val vm = createViewModel()
        assertEquals(ConnectionMode.REMOTE, vm.uiState.value.connectionMode)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.remoteUrl)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.serverUrl)
        assertTrue(vm.uiState.value.showManualEntry)
        assertTrue(vm.uiState.value.isVerifyingServer)
    }

    // ── Init: LOCAL mode, no cached URL ─────────────────────────────────

    @Test
    fun `init LOCAL mode no cached URL triggers scan`() = runTest(testDispatcher) {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel()
        advanceUntilIdle()
        assertTrue(vm.scanAttempt.value > 0)
    }

    @Test
    fun `init LOCAL mode no cached URL sets LOCAL connection mode`() {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel()
        assertEquals(ConnectionMode.LOCAL, vm.uiState.value.connectionMode)
    }

    // ── Init: LOCAL mode, with cached URL ───────────────────────────────

    @Test
    fun `init LOCAL mode with cached URL sets serverUrl and starts verification`() {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns "http://192.168.1.10:5062"
        val vm = createViewModel()
        assertEquals("http://192.168.1.10:5062", vm.uiState.value.serverUrl)
        assertTrue(vm.uiState.value.isVerifyingServer)
    }

    // ── Init: REMOTE mode ───────────────────────────────────────────────

    @Test
    fun `init REMOTE mode loads remote URL from prefs`() {
        every { prefs.getString("remote_server_url", "") } returns "http://remote:5062"
        val vm = createViewModel()
        assertEquals(ConnectionMode.REMOTE, vm.uiState.value.connectionMode)
        assertEquals("http://remote:5062", vm.uiState.value.remoteUrl)
    }

    @Test
    fun `init REMOTE mode with URL sets showManualEntry and isVerifyingServer`() {
        every { prefs.getString("remote_server_url", "") } returns "http://remote:5062"
        val vm = createViewModel()
        assertTrue(vm.uiState.value.showManualEntry)
        assertTrue(vm.uiState.value.isVerifyingServer)
        assertEquals("http://remote:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `init REMOTE mode with blank URL uses default URL and verifies`() {
        val vm = createViewModel()
        assertEquals(ConnectionMode.REMOTE, vm.uiState.value.connectionMode)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.remoteUrl)
        assertTrue(vm.uiState.value.isVerifyingServer)
    }

    // ── Init: skipAutoConnect ───────────────────────────────────────────

    @Test
    fun `init skipAutoConnect LOCAL scans without auto-connecting`() = runTest(testDispatcher) {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel(skipAutoConnect = true)
        advanceUntilIdle()
        assertTrue(vm.scanAttempt.value > 0)
    }

    @Test
    fun `init skipAutoConnect REMOTE shows manual entry with saved URL`() {
        every { prefs.getString("remote_server_url", "") } returns "http://saved:5062"
        val vm = createViewModel(skipAutoConnect = true)
        assertTrue(vm.uiState.value.showManualEntry)
        assertEquals("http://saved:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `init skipAutoConnect REMOTE with blank URL shows default URL`() {
        val vm = createViewModel(skipAutoConnect = true)
        assertTrue(vm.uiState.value.showManualEntry)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.serverUrl)
    }

    // ── updateServerUrl ─────────────────────────────────────────────────

    @Test
    fun `updateServerUrl updates state`() {
        val vm = createViewModel()
        vm.updateServerUrl("http://new:5062")
        assertEquals("http://new:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `updateServerUrl does not save to prefs`() {
        val vm = createViewModel()
        vm.updateServerUrl("http://new:5062")
        verify(exactly = 0) { editor.putString("cached_server_url", "http://new:5062") }
    }

    // ── confirmServer ───────────────────────────────────────────────────

    @Test
    fun `confirmServer with blank URL shows error`() {
        val vm = createViewModel()
        vm.updateServerUrl("")
        vm.confirmServer()
        assertEquals("Enter a server address", vm.uiState.value.errorMessage)
        assertFalse(vm.uiState.value.isLoading)
    }

    @Test
    fun `confirmServer with whitespace-only URL shows error`() {
        val vm = createViewModel()
        vm.updateServerUrl("   ")
        vm.confirmServer()
        assertEquals("Enter a server address", vm.uiState.value.errorMessage)
    }

    @Test
    fun `confirmServer with valid URL sets isLoading and normalizes scheme`() {
        val vm = createViewModel()
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        assertTrue(vm.uiState.value.isLoading)
        assertEquals("http://192.168.1.10:5062", vm.uiState.value.serverUrl)
        assertNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `confirmServer preserves http scheme`() {
        val vm = createViewModel()
        vm.updateServerUrl("http://myserver:5062")
        vm.confirmServer()
        assertEquals("http://myserver:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `confirmServer preserves https scheme`() {
        val vm = createViewModel()
        vm.updateServerUrl("https://myserver:5062")
        vm.confirmServer()
        assertEquals("https://myserver:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `confirmServer clears previous error`() {
        val vm = createViewModel()
        vm.updateServerUrl("")
        vm.confirmServer()
        assertNotNull(vm.uiState.value.errorMessage)
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        assertNull(vm.uiState.value.errorMessage)
    }

    // ── selectDiscoveredServer ──────────────────────────────────────────

    @Test
    fun `selectDiscoveredServer builds URL and sets connected`() {
        val address = mockk<InetAddress>()
        every { address.hostAddress } returns "192.168.1.50"
        val server = DiscoveredServer("MyServer", "host", "http://+:5062", "1.0", address)
        every { discoveryClient.buildServerUrl(server) } returns "http://192.168.1.50:5062"

        val vm = createViewModel()
        vm.selectDiscoveredServer(server)

        assertEquals("http://192.168.1.50:5062", vm.uiState.value.serverUrl)
        assertTrue(vm.uiState.value.isConnected)
        assertNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `selectDiscoveredServer saves URL to prefs`() {
        val address = mockk<InetAddress>()
        every { address.hostAddress } returns "192.168.1.50"
        val server = DiscoveredServer("MyServer", "host", "http://+:5062", "1.0", address)
        every { discoveryClient.buildServerUrl(server) } returns "http://192.168.1.50:5062"

        val vm = createViewModel()
        vm.selectDiscoveredServer(server)

        verify { editor.putString("cached_server_url", "http://192.168.1.50:5062") }
        verify { editor.apply() }
    }

    // ── setConnectionMode ───────────────────────────────────────────────

    @Test
    fun `setConnectionMode LOCAL hides manual entry and clears error`() {
        val vm = createViewModel()
        vm.setConnectionMode(ConnectionMode.REMOTE)
        assertTrue(vm.uiState.value.showManualEntry)
        vm.setConnectionMode(ConnectionMode.LOCAL)
        assertFalse(vm.uiState.value.showManualEntry)
        assertNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `setConnectionMode LOCAL saves mode to prefs`() {
        val vm = createViewModel()
        vm.setConnectionMode(ConnectionMode.LOCAL)
        verify { editor.putString("connection_mode", "local") }
    }

    @Test
    fun `setConnectionMode LOCAL triggers scan`() = runTest(testDispatcher) {
        val vm = createViewModel()
        val scanBefore = vm.scanAttempt.value
        vm.setConnectionMode(ConnectionMode.LOCAL)
        advanceUntilIdle()
        assertTrue(vm.scanAttempt.value > scanBefore)
    }

    @Test
    fun `setConnectionMode REMOTE shows manual entry`() {
        val vm = createViewModel()
        vm.setConnectionMode(ConnectionMode.REMOTE)
        assertTrue(vm.uiState.value.showManualEntry)
        assertNull(vm.uiState.value.errorMessage)
        assertEquals(ConnectionMode.REMOTE, vm.uiState.value.connectionMode)
    }

    @Test
    fun `setConnectionMode REMOTE saves mode to prefs`() {
        val vm = createViewModel()
        vm.setConnectionMode(ConnectionMode.REMOTE)
        verify { editor.putString("connection_mode", "remote") }
    }

    @Test
    fun `setConnectionMode REMOTE uses saved remoteUrl as serverUrl`() {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel()
        vm.updateRemoteUrl("myserver:5062")
        vm.setConnectionMode(ConnectionMode.REMOTE)
        assertEquals(vm.uiState.value.remoteUrl, vm.uiState.value.serverUrl)
    }

    @Test
    fun `setConnectionMode REMOTE with blank remoteUrl uses default URL`() {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel()
        vm.setConnectionMode(ConnectionMode.REMOTE)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.serverUrl)
        assertEquals(ServerViewModel.DEFAULT_REMOTE_URL, vm.uiState.value.remoteUrl)
    }

    // ── updateRemoteUrl ─────────────────────────────────────────────────

    @Test
    fun `updateRemoteUrl normalizes scheme and updates state`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("myserver:5062")
        assertEquals("http://myserver:5062", vm.uiState.value.remoteUrl)
        assertEquals("http://myserver:5062", vm.uiState.value.serverUrl)
    }

    @Test
    fun `updateRemoteUrl preserves existing http scheme`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("http://myserver:5062")
        assertEquals("http://myserver:5062", vm.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl preserves existing https scheme`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("https://secure:5062")
        assertEquals("https://secure:5062", vm.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl trims whitespace and trailing slashes`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("  myserver:5062/  ")
        assertEquals("http://myserver:5062", vm.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl with blank input sets empty string`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("   ")
        assertEquals("", vm.uiState.value.remoteUrl)
    }

    @Test
    fun `updateRemoteUrl saves to prefs`() {
        val vm = createViewModel()
        vm.updateRemoteUrl("myserver:5062")
        verify { editor.putString("remote_server_url", "http://myserver:5062") }
        verify { editor.apply() }
    }

    // ── toggleManualEntry ───────────────────────────────────────────────

    @Test
    fun `toggleManualEntry toggles from false to true`() {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        val vm = createViewModel()
        assertFalse(vm.uiState.value.showManualEntry)
        vm.toggleManualEntry()
        assertTrue(vm.uiState.value.showManualEntry)
    }

    @Test
    fun `toggleManualEntry toggles from true to false`() {
        val vm = createViewModel()
        assertTrue(vm.uiState.value.showManualEntry)
        vm.toggleManualEntry()
        assertFalse(vm.uiState.value.showManualEntry)
    }

    // ── scanForServers ──────────────────────────────────────────────────

    @Test
    fun `scanForServers increments scanAttempt`() {
        val vm = createViewModel()
        val initial = vm.scanAttempt.value
        vm.scanForServers()
        assertEquals(initial + 1, vm.scanAttempt.value)
    }

    @Test
    fun `scanForServers increments on each call`() {
        val vm = createViewModel()
        val initial = vm.scanAttempt.value
        vm.scanForServers()
        vm.scanForServers()
        vm.scanForServers()
        assertEquals(initial + 3, vm.scanAttempt.value)
    }

    @Test
    fun `scanForServers delegates to discoveryClient scan`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.scanForServers()
        advanceUntilIdle()
        coVerify { discoveryClient.scan() }
    }

    // ── discoveredServers and isScanning delegation ─────────────────────

    @Test
    fun `discoveredServers comes from discoveryClient`() {
        val serversFlow = MutableStateFlow<List<DiscoveredServer>>(emptyList())
        every { discoveryClient.discoveredServers } returns serversFlow
        val vm = createViewModel()
        assertTrue(vm.discoveredServers.value.isEmpty())
    }

    @Test
    fun `isScanning comes from discoveryClient`() {
        val scanningFlow = MutableStateFlow(false)
        every { discoveryClient.isScanning } returns scanningFlow
        val vm = createViewModel()
        assertFalse(vm.isScanning.value)
    }

    // ── verifyCachedServer via init (using openConnection factory) ──────

    @Test
    fun `verifyCachedServer sets isConnected on valid PulseRealm response`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(200, "PulseRealm Server v1.0")
        every { prefs.getString("connection_mode", "remote") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns "http://192.168.1.10:5062"
        val vm = createViewModel(mockConn = mockConn)
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isVerifyingServer)
        assertNull(vm.uiState.value.errorMessage)
    }

    @Test
    fun `verifyCachedServer falls back to scan on non-200 response`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(404)
        every { prefs.getString("connection_mode", "remote") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns "http://192.168.1.10:5062"
        val vm = createViewModel(mockConn = mockConn)
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isVerifyingServer)
    }

    @Test
    fun `verifyCachedServer falls back to scan on non-PulseRealm body`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(200, "Some other server")
        every { prefs.getString("connection_mode", "remote") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns "http://192.168.1.10:5062"
        val vm = createViewModel(mockConn = mockConn)
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isVerifyingServer)
    }

    @Test
    fun `verifyCachedServer falls back to scan on exception`() = runTest(testDispatcher) {
        every { prefs.getString("connection_mode", "remote") } returns "local"
        every { prefs.getString("cached_server_url", null) } returns "http://192.168.1.10:5062"
        val savedStateHandle = SavedStateHandle()
        val vm = ServerViewModel(prefs, discoveryClient, savedStateHandle).also {
            it.ioDispatcher = testDispatcher
            it.openConnection = { throw java.net.ConnectException("Connection refused") }
        }
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isVerifyingServer)
    }

    // ── confirmServer HTTP tests ────────────────────────────────────────

    @Test
    fun `confirmServer sets isConnected on valid PulseRealm response`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(200, "PulseRealm Server v1.0")
        val vm = createViewModel(mockConn = mockConn)
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isLoading)
        assertNull(vm.uiState.value.errorMessage)
        verify { editor.putString("cached_server_url", "http://192.168.1.10:5062") }
    }

    @Test
    fun `confirmServer shows error on non-PulseRealm response`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(200, "Nginx default page")
        val vm = createViewModel(mockConn = mockConn)
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Not a PulseRealm server", vm.uiState.value.errorMessage)
    }

    @Test
    fun `confirmServer shows error on network exception`() = runTest(testDispatcher) {
        val vm = createViewModel()
        vm.openConnection = { throw java.net.ConnectException("refused") }
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertFalse(vm.uiState.value.isLoading)
        assertEquals("Could not reach server", vm.uiState.value.errorMessage)
    }

    @Test
    fun `confirmServer shows error on non-200 response`() = runTest(testDispatcher) {
        val mockConn = mockHttpConnection(500)
        val vm = createViewModel(mockConn = mockConn)
        vm.updateServerUrl("192.168.1.10:5062")
        vm.confirmServer()
        advanceUntilIdle()

        assertFalse(vm.uiState.value.isConnected)
        assertEquals("Not a PulseRealm server", vm.uiState.value.errorMessage)
    }
}
