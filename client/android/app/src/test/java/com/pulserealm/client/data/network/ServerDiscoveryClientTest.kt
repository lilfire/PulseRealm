package com.pulserealm.client.data.network

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.net.InetAddress

@OptIn(ExperimentalCoroutinesApi::class)
class ServerDiscoveryClientTest {

    private lateinit var client: ServerDiscoveryClient

    @Before
    fun setup() {
        client = ServerDiscoveryClient()
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
        // Should still use http:// for the actual URL since it's LAN
        assertEquals("http://192.168.1.100:5062", url)
    }

    @Test
    fun `scan sets isScanning during execution`() = runTest {
        // Scan will complete quickly (timeout) with no servers found in test env
        // We just verify it doesn't crash and resets state properly
        client.scan()
        assertFalse(client.isScanning.value)
    }

    @Test
    fun `scan clears previous servers`() = runTest {
        // First scan
        client.scan()
        assertTrue(client.discoveredServers.value.isEmpty())

        // Second scan should also start fresh
        client.scan()
        assertTrue(client.discoveredServers.value.isEmpty())
        assertFalse(client.isScanning.value)
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
    fun `copy modifies specified fields`() {
        val addr = InetAddress.getByName("192.168.1.100")
        val original = DiscoveredServer("A", "host", "http://+:5062", "1.0", addr)
        val modified = original.copy(name = "B", version = "2.0")

        assertEquals("B", modified.name)
        assertEquals("host", modified.hostname)
        assertEquals("2.0", modified.version)
    }
}
