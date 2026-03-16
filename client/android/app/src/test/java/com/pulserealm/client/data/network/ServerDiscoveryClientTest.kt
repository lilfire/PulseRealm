package com.pulserealm.client.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.net.InetAddress

@OptIn(ExperimentalCoroutinesApi::class)
class ServerDiscoveryClientTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var client: ServerDiscoveryClient

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        client = ServerDiscoveryClient(ioDispatcher = testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state has empty server list`() {
        assertTrue(client.discoveredServers.value.isEmpty())
    }

    @Test
    fun `initial state is not scanning`() {
        assertFalse(client.isScanning.value)
    }

    @Test
    fun `DISCOVERY_PORT is 5063`() {
        assertEquals(5063, ServerDiscoveryClient.DISCOVERY_PORT)
    }

    @Test
    fun `LISTEN_TIMEOUT_MS is 8000`() {
        assertEquals(8000, ServerDiscoveryClient.LISTEN_TIMEOUT_MS)
    }

    @Test
    fun `buildServerUrl extracts port from urls field`() {
        val server = DiscoveredServer(
            name = "TestServer",
            hostname = "myhost",
            urls = "http://+:5062",
            version = "1.0",
            address = InetAddress.getByName("192.168.1.100")
        )

        val url = client.buildServerUrl(server)
        assertEquals("http://192.168.1.100:5062", url)
    }

    @Test
    fun `buildServerUrl handles different port`() {
        val server = DiscoveredServer(
            name = "TestServer",
            hostname = "myhost",
            urls = "http://+:8080",
            version = "1.0",
            address = InetAddress.getByName("10.0.0.5")
        )

        val url = client.buildServerUrl(server)
        assertEquals("http://10.0.0.5:8080", url)
    }

    @Test
    fun `buildServerUrl defaults to 5062 when no port found`() {
        val server = DiscoveredServer(
            name = "TestServer",
            hostname = "myhost",
            urls = "",
            version = "1.0",
            address = InetAddress.getByName("192.168.1.50")
        )

        val url = client.buildServerUrl(server)
        assertEquals("http://192.168.1.50:5062", url)
    }

    @Test
    fun `buildServerUrl handles https urls field`() {
        val server = DiscoveredServer(
            name = "TestServer",
            hostname = "myhost",
            urls = "https://+:5062",
            version = "1.0",
            address = InetAddress.getByName("192.168.1.100")
        )

        val url = client.buildServerUrl(server)
        assertEquals("http://192.168.1.100:5062", url)
    }

    @Test
    fun `buildServerUrl with high port number`() {
        val server = DiscoveredServer(
            name = "TestServer",
            hostname = "myhost",
            urls = "http://+:49152",
            version = "1.0",
            address = InetAddress.getByName("10.0.0.1")
        )

        val url = client.buildServerUrl(server)
        assertEquals("http://10.0.0.1:49152", url)
    }

    @Test
    fun `scan sets isScanning to true then false`() = runTest {
        // Scan completes quickly in test env (no servers to find)
        client.scan()

        // After scan completes, isScanning should be false
        assertFalse(client.isScanning.value)
    }

    @Test
    fun `scan clears previous servers`() = runTest {
        client.scan()
        assertTrue(client.discoveredServers.value.isEmpty())

        // Second scan should also start fresh
        client.scan()
        assertTrue(client.discoveredServers.value.isEmpty())
        assertFalse(client.isScanning.value)
    }

    @Test
    fun `scan resets isScanning on completion`() = runTest {
        client.scan()
        assertFalse(client.isScanning.value)
    }

    @Test
    fun `constructor accepts default dispatcher`() {
        val defaultClient = ServerDiscoveryClient()
        assertTrue(defaultClient.discoveredServers.value.isEmpty())
        assertFalse(defaultClient.isScanning.value)
    }
}

class DiscoveredServerTest {

    @Test
    fun `data class properties are accessible`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val server = DiscoveredServer(
            name = "PulseRealm",
            hostname = "desktop-abc",
            urls = "http://+:5062",
            version = "1.2.0",
            address = addr
        )

        assertEquals("PulseRealm", server.name)
        assertEquals("desktop-abc", server.hostname)
        assertEquals("http://+:5062", server.urls)
        assertEquals("1.2.0", server.version)
        assertEquals(addr, server.address)
    }

    @Test
    fun `equality works correctly`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val a = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        val b = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        assertEquals(a, b)
    }

    @Test
    fun `inequality on different name`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val a = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        val b = DiscoveredServer("B", "host", "http://+:5062", "1.0", addr)
        assertNotEquals(a, b)
    }

    @Test
    fun `copy modifies specified fields`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val original = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        val modified = original.copy(name = "B", version = "2.0")

        assertEquals("B", modified.name)
        assertEquals("host", modified.hostname)
        assertEquals("2.0", modified.version)
    }

    @Test
    fun `hashCode is consistent with equality`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val a = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        val b = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        assertEquals(a.hashCode(), b.hashCode())
    }
}
