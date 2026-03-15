package com.pulserealm.client.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

data class DiscoveredServer(
    val name: String,
    val hostname: String,
    val urls: String,
    val version: String,
    val address: InetAddress
)

/**
 * Discovers PulseRealm servers on the local network using UDP broadcast.
 *
 * 1. Sends a discovery request broadcast so servers respond immediately
 * 2. Listens for both direct responses and periodic server broadcast announcements
 */
class ServerDiscoveryClient {

    companion object {
        const val DISCOVERY_PORT = 5063
        const val LISTEN_TIMEOUT_MS = 8000
        private const val SOCKET_TIMEOUT_MS = 2000
    }

    private val _discoveredServers = MutableStateFlow<List<DiscoveredServer>>(emptyList())
    val discoveredServers: StateFlow<List<DiscoveredServer>> = _discoveredServers.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    /**
     * Actively discovers servers by sending a broadcast request and listening for responses.
     * Should be called from a coroutine on IO dispatcher.
     */
    suspend fun scan() = withContext(Dispatchers.IO) {
        _isScanning.value = true
        _discoveredServers.value = emptyList()
        val found = mutableMapOf<String, DiscoveredServer>()

        try {
            val socket = DatagramSocket(null)
            socket.reuseAddress = true
            socket.bind(java.net.InetSocketAddress(DISCOVERY_PORT))
            socket.broadcast = true
            socket.soTimeout = SOCKET_TIMEOUT_MS

            // Send a discovery request so the server responds immediately
            // instead of waiting up to 3 seconds for the next broadcast cycle
            sendDiscoveryRequest(socket)

            val buffer = ByteArray(1024)
            val deadline = System.currentTimeMillis() + LISTEN_TIMEOUT_MS

            while (System.currentTimeMillis() < deadline) {
                try {
                    val packet = DatagramPacket(buffer, buffer.size)
                    socket.receive(packet)

                    val json = String(packet.data, 0, packet.length, Charsets.UTF_8)
                    val obj = JSONObject(json)

                    if (obj.optString("service") == "PulseRealm") {
                        val server = DiscoveredServer(
                            name = obj.optString("name", "PulseRealm"),
                            hostname = obj.optString("hostname", "Unknown"),
                            urls = obj.optString("urls", ""),
                            version = obj.optString("version", ""),
                            address = packet.address
                        )
                        val key = packet.address.hostAddress ?: continue
                        found[key] = server
                        _discoveredServers.value = found.values.toList()
                    }
                } catch (_: java.net.SocketTimeoutException) {
                    // Re-send discovery request on timeout to handle packet loss
                    if (found.isEmpty() && System.currentTimeMillis() + SOCKET_TIMEOUT_MS < deadline) {
                        sendDiscoveryRequest(socket)
                    }
                }
            }

            socket.close()
        } catch (e: Exception) {
            // Discovery failed silently — user can still enter manually
        }

        _isScanning.value = false
    }

    /**
     * Sends a broadcast discovery request packet.
     * The server listens for these and responds immediately with its info.
     */
    private fun sendDiscoveryRequest(socket: DatagramSocket) {
        try {
            val request = JSONObject().apply {
                put("discover", "PulseRealm")
            }.toString()
            val data = request.toByteArray(Charsets.UTF_8)
            val packet = DatagramPacket(
                data, data.size,
                InetAddress.getByName("255.255.255.255"),
                DISCOVERY_PORT
            )
            socket.send(packet)
        } catch (_: Exception) {
            // Best effort — we still listen for periodic broadcasts
        }
    }

    /**
     * Builds the HTTP base URL for a discovered server, using its IP address
     * and the port from the broadcast data.
     */
    fun buildServerUrl(server: DiscoveredServer): String {
        // Parse port from the urls field (e.g. "http://+:5062" or "http://+:8080")
        val port = Regex(":(\\d+)").find(server.urls)?.groupValues?.get(1) ?: "5062"
        val ip = server.address.hostAddress
        return "http://$ip:$port"
    }
}
