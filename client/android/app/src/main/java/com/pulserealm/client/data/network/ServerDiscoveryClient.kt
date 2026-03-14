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
    val hostname: String,
    val urls: String,
    val version: String,
    val address: InetAddress
)

/**
 * Listens for UDP broadcast packets from PulseRealm servers on the local network.
 */
class ServerDiscoveryClient {

    companion object {
        const val DISCOVERY_PORT = 5063
        const val LISTEN_TIMEOUT_MS = 6000
    }

    private val _discoveredServers = MutableStateFlow<List<DiscoveredServer>>(emptyList())
    val discoveredServers: StateFlow<List<DiscoveredServer>> = _discoveredServers.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    /**
     * Listens for server broadcasts for the specified duration.
     * Should be called from a coroutine on IO dispatcher.
     */
    suspend fun scan() = withContext(Dispatchers.IO) {
        _isScanning.value = true
        _discoveredServers.value = emptyList()
        val found = mutableMapOf<String, DiscoveredServer>()

        try {
            val socket = DatagramSocket(DISCOVERY_PORT)
            socket.broadcast = true
            socket.soTimeout = LISTEN_TIMEOUT_MS

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
                    // Timeout is expected, continue checking deadline
                }
            }

            socket.close()
        } catch (e: Exception) {
            // Discovery failed silently — user can still enter manually
        }

        _isScanning.value = false
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
