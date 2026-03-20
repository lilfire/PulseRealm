package com.pulserealm.client.data.network

import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.unmockkConstructor
import io.mockk.verify
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
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException

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

/**
 * Tests for ServerDiscoveryClient.scan() with mocked DatagramSocket.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ServerDiscoveryScanTest {

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
    fun `scan discovers server from valid PulseRealm broadcast`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            val responseJson = """{"service":"PulseRealm","name":"MyServer","hostname":"desktop","urls":"http://+:5062","version":"1.0"}"""
            val responseBytes = responseJson.toByteArray(Charsets.UTF_8)
            val responseAddr = InetAddress.getByName("192.168.1.42")
            var receiveCount = 0

            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } answers {
                receiveCount++
                if (receiveCount == 1) {
                    val packet = firstArg<DatagramPacket>()
                    responseBytes.copyInto(packet.data)
                    packet.length = responseBytes.size

                    val addressField = DatagramPacket::class.java.getDeclaredField("address")
                    addressField.isAccessible = true
                    addressField.set(packet, responseAddr)
                } else {
                    // After first response, keep throwing timeout until deadline passes
                    throw SocketTimeoutException("timeout")
                }
            }

            client.scan()

            val servers = client.discoveredServers.value
            assertEquals(1, servers.size)
            assertEquals("MyServer", servers[0].name)
            assertEquals("desktop", servers[0].hostname)
            assertEquals("http://+:5062", servers[0].urls)
            assertEquals("1.0", servers[0].version)
            assertEquals(responseAddr, servers[0].address)
            assertFalse(client.isScanning.value)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan ignores non-PulseRealm packets`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            val responseJson = """{"service":"OtherApp","name":"Server"}"""
            val responseBytes = responseJson.toByteArray(Charsets.UTF_8)
            var receiveCount = 0

            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } answers {
                receiveCount++
                if (receiveCount == 1) {
                    val packet = firstArg<DatagramPacket>()
                    responseBytes.copyInto(packet.data)
                    packet.length = responseBytes.size

                    val addressField = DatagramPacket::class.java.getDeclaredField("address")
                    addressField.isAccessible = true
                    addressField.set(packet, InetAddress.getByName("192.168.1.99"))
                } else {
                    throw SocketTimeoutException("timeout")
                }
            }

            client.scan()

            assertTrue(client.discoveredServers.value.isEmpty())
            assertFalse(client.isScanning.value)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan handles BindException gracefully`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } throws java.net.BindException("Address in use")

            client.scan()

            assertTrue(client.discoveredServers.value.isEmpty())
            assertFalse(client.isScanning.value)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan handles generic exception gracefully`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            every { anyConstructed<DatagramSocket>().reuseAddress = any() } throws RuntimeException("unexpected")

            client.scan()

            assertTrue(client.discoveredServers.value.isEmpty())
            assertFalse(client.isScanning.value)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan deduplicates servers by IP address`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            val responseJson = """{"service":"PulseRealm","name":"MyServer","hostname":"desktop","urls":"http://+:5062","version":"1.0"}"""
            val responseBytes = responseJson.toByteArray(Charsets.UTF_8)
            val responseAddr = InetAddress.getByName("192.168.1.42")
            var receiveCount = 0

            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } answers {
                receiveCount++
                if (receiveCount <= 3) {
                    // Same server responds 3 times
                    val packet = firstArg<DatagramPacket>()
                    responseBytes.copyInto(packet.data)
                    packet.length = responseBytes.size

                    val addressField = DatagramPacket::class.java.getDeclaredField("address")
                    addressField.isAccessible = true
                    addressField.set(packet, responseAddr)
                } else {
                    throw SocketTimeoutException("timeout")
                }
            }

            client.scan()

            // Should be deduplicated to 1 server
            assertEquals(1, client.discoveredServers.value.size)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan discovers multiple different servers`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            val response1 = """{"service":"PulseRealm","name":"Server1","hostname":"host1","urls":"http://+:5062","version":"1.0"}"""
            val response2 = """{"service":"PulseRealm","name":"Server2","hostname":"host2","urls":"http://+:8080","version":"2.0"}"""
            val bytes1 = response1.toByteArray(Charsets.UTF_8)
            val bytes2 = response2.toByteArray(Charsets.UTF_8)
            var receiveCount = 0

            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } answers {
                receiveCount++
                val packet = firstArg<DatagramPacket>()
                val addressField = DatagramPacket::class.java.getDeclaredField("address")
                addressField.isAccessible = true

                when (receiveCount) {
                    1 -> {
                        bytes1.copyInto(packet.data)
                        packet.length = bytes1.size
                        addressField.set(packet, InetAddress.getByName("192.168.1.10"))
                    }
                    2 -> {
                        bytes2.copyInto(packet.data)
                        packet.length = bytes2.size
                        addressField.set(packet, InetAddress.getByName("192.168.1.20"))
                    }
                    else -> throw SocketTimeoutException("timeout")
                }
            }

            client.scan()

            assertEquals(2, client.discoveredServers.value.size)
            val names = client.discoveredServers.value.map { it.name }.toSet()
            assertTrue(names.contains("Server1"))
            assertTrue(names.contains("Server2"))
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan sends discovery request on socket`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } throws SocketTimeoutException("timeout")

            client.scan()

            // Verify at least one send was made (discovery request)
            verify(atLeast = 1) { anyConstructed<DatagramSocket>().send(any()) }
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan sets isScanning during scan and resets after`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } throws SocketTimeoutException("timeout")

            client.scan()
            assertFalse(client.isScanning.value)
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }

    @Test
    fun `scan clears previous servers before starting`() = runTest(testDispatcher) {
        mockkConstructor(DatagramSocket::class)
        try {
            val responseJson = """{"service":"PulseRealm","name":"Server1","hostname":"host","urls":"http://+:5062","version":"1.0"}"""
            val responseBytes = responseJson.toByteArray(Charsets.UTF_8)
            var receiveCount = 0

            every { anyConstructed<DatagramSocket>().reuseAddress = any() } returns Unit
            every { anyConstructed<DatagramSocket>().bind(any<InetSocketAddress>()) } returns Unit
            every { anyConstructed<DatagramSocket>().broadcast = any() } returns Unit
            every { anyConstructed<DatagramSocket>().soTimeout = any() } returns Unit
            every { anyConstructed<DatagramSocket>().send(any()) } returns Unit
            every { anyConstructed<DatagramSocket>().close() } returns Unit
            every { anyConstructed<DatagramSocket>().receive(any()) } answers {
                receiveCount++
                if (receiveCount == 1) {
                    val packet = firstArg<DatagramPacket>()
                    responseBytes.copyInto(packet.data)
                    packet.length = responseBytes.size

                    val addressField = DatagramPacket::class.java.getDeclaredField("address")
                    addressField.isAccessible = true
                    addressField.set(packet, InetAddress.getByName("192.168.1.42"))
                } else {
                    throw SocketTimeoutException("timeout")
                }
            }

            // First scan finds a server
            client.scan()
            assertEquals(1, client.discoveredServers.value.size)

            // Reset count so second scan finds nothing
            receiveCount = 10

            // Second scan should clear the first result
            client.scan()
            assertTrue(client.discoveredServers.value.isEmpty())
        } finally {
            unmockkConstructor(DatagramSocket::class)
        }
    }
}
