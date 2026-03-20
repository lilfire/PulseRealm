package com.pulserealm.client.data.network

import org.junit.Assert.*
import org.junit.Test

class UserFriendlyErrorsTest {

    // ── fromRawMessage: connection / network errors ─────────────────────

    @Test
    fun `connection refused returns could not reach server`() {
        assertEquals("Could not reach the server", UserFriendlyErrors.fromRawMessage("connection refused"))
    }

    @Test
    fun `econnrefused returns could not reach server`() {
        assertEquals("Could not reach the server", UserFriendlyErrors.fromRawMessage("ECONNREFUSED"))
    }

    @Test
    fun `timeout returns server took too long`() {
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromRawMessage("timeout"))
    }

    @Test
    fun `timed out returns server took too long`() {
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromRawMessage("Request timed out"))
    }

    @Test
    fun `sockettimeout returns server took too long`() {
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromRawMessage("java.net.SocketTimeout"))
    }

    @Test
    fun `unknown host returns server not found`() {
        assertEquals("Server not found — check the address", UserFriendlyErrors.fromRawMessage("unknown host exception"))
    }

    @Test
    fun `unknownhost returns server not found`() {
        assertEquals("Server not found — check the address", UserFriendlyErrors.fromRawMessage("UnknownHost"))
    }

    @Test
    fun `no address associated returns server not found`() {
        assertEquals("Server not found — check the address", UserFriendlyErrors.fromRawMessage("No address associated with hostname"))
    }

    @Test
    fun `network is unreachable returns no network`() {
        assertEquals("No network connection", UserFriendlyErrors.fromRawMessage("Network is unreachable"))
    }

    @Test
    fun `no route to host returns no network`() {
        assertEquals("No network connection", UserFriendlyErrors.fromRawMessage("No route to host"))
    }

    @Test
    fun `enetunreach returns no network`() {
        assertEquals("No network connection", UserFriendlyErrors.fromRawMessage("ENETUNREACH"))
    }

    @Test
    fun `ssl returns secure connection failed`() {
        assertEquals("Secure connection failed", UserFriendlyErrors.fromRawMessage("SSL error occurred"))
    }

    @Test
    fun `certificate returns secure connection failed`() {
        assertEquals("Secure connection failed", UserFriendlyErrors.fromRawMessage("Certificate not valid"))
    }

    @Test
    fun `handshake returns secure connection failed`() {
        assertEquals("Secure connection failed", UserFriendlyErrors.fromRawMessage("Handshake failed"))
    }

    @Test
    fun `connection reset returns connection interrupted`() {
        assertEquals("Connection was interrupted", UserFriendlyErrors.fromRawMessage("Connection reset by peer"))
    }

    @Test
    fun `broken pipe returns connection interrupted`() {
        assertEquals("Connection was interrupted", UserFriendlyErrors.fromRawMessage("Broken pipe"))
    }

    @Test
    fun `econnreset returns connection interrupted`() {
        assertEquals("Connection was interrupted", UserFriendlyErrors.fromRawMessage("ECONNRESET"))
    }

    @Test
    fun `connection failed returns could not connect`() {
        assertEquals("Could not connect to the server", UserFriendlyErrors.fromRawMessage("Connection failed"))
    }

    // ── fromRawMessage: HTTP errors ─────────────────────────────────────

    @Test
    fun `404 returns realm not found`() {
        assertEquals("Realm not found — check the join code", UserFriendlyErrors.fromRawMessage("HTTP 404"))
    }

    @Test
    fun `not found returns realm not found`() {
        assertEquals("Realm not found — check the join code", UserFriendlyErrors.fromRawMessage("Not Found"))
    }

    @Test
    fun `500 returns server error`() {
        assertEquals("Server error — try again", UserFriendlyErrors.fromRawMessage("HTTP 500"))
    }

    @Test
    fun `internal server error returns server error`() {
        assertEquals("Server error — try again", UserFriendlyErrors.fromRawMessage("Internal Server Error"))
    }

    @Test
    fun `503 returns server unavailable`() {
        assertEquals("Server is temporarily unavailable", UserFriendlyErrors.fromRawMessage("HTTP 503"))
    }

    @Test
    fun `service unavailable returns server unavailable`() {
        assertEquals("Server is temporarily unavailable", UserFriendlyErrors.fromRawMessage("Service Unavailable"))
    }

    // ── fromRawMessage: realm pass-through ──────────────────────────────

    @Test
    fun `realm keyword passes through raw message`() {
        val msg = "Realm is full"
        assertEquals(msg, UserFriendlyErrors.fromRawMessage(msg))
    }

    @Test
    fun `join code keyword passes through raw message`() {
        val msg = "Invalid join code"
        assertEquals(msg, UserFriendlyErrors.fromRawMessage(msg))
    }

    @Test
    fun `full keyword passes through raw message`() {
        val msg = "Session is full, no more players"
        assertEquals(msg, UserFriendlyErrors.fromRawMessage(msg))
    }

    @Test
    fun `already started keyword passes through raw message`() {
        val msg = "Game has already started"
        assertEquals(msg, UserFriendlyErrors.fromRawMessage(msg))
    }

    @Test
    fun `kicked keyword passes through raw message`() {
        val msg = "You were kicked from the game"
        assertEquals(msg, UserFriendlyErrors.fromRawMessage(msg))
    }

    // ── fromRawMessage: edge cases ──────────────────────────────────────

    @Test
    fun `null message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage(null))
    }

    @Test
    fun `blank message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage("   "))
    }

    @Test
    fun `empty message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage(""))
    }

    @Test
    fun `unknown message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage("some random error xyz"))
    }

    @Test
    fun `custom fallback is used`() {
        assertEquals("Custom fallback", UserFriendlyErrors.fromRawMessage(null, "Custom fallback"))
    }

    @Test
    fun `custom fallback for unknown message`() {
        assertEquals("Oops", UserFriendlyErrors.fromRawMessage("totally unknown error", "Oops"))
    }

    // ── fromRawMessage: case insensitivity ──────────────────────────────

    @Test
    fun `CONNECTION REFUSED uppercase matches`() {
        assertEquals("Could not reach the server", UserFriendlyErrors.fromRawMessage("CONNECTION REFUSED"))
    }

    @Test
    fun `Timeout mixed case matches`() {
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromRawMessage("Socket Timeout Exception"))
    }

    // ── fromException ───────────────────────────────────────────────────

    @Test
    fun `fromException with simple message`() {
        val ex = RuntimeException("Connection refused")
        assertEquals("Could not reach the server", UserFriendlyErrors.fromException(ex))
    }

    @Test
    fun `fromException with nested cause chain`() {
        val root = java.net.SocketTimeoutException("timed out")
        val wrapper = RuntimeException("Something happened", root)
        val outer = Exception("Outer", wrapper)
        // Should find "Something happened" first (not blank), which is unknown → fallback
        // Actually the first non-blank message is "Outer", which is unknown → fallback
        assertEquals("Something went wrong", UserFriendlyErrors.fromException(outer))
    }

    @Test
    fun `fromException walks chain to find useful message`() {
        val root = RuntimeException("Connection refused")
        val wrapper = RuntimeException(null, root)
        val outer = Exception(null, wrapper)
        // outer.message = null, wrapper.message = null, root.message = "Connection refused"
        assertEquals("Could not reach the server", UserFriendlyErrors.fromException(outer))
    }

    @Test
    fun `fromException with all null messages returns fallback`() {
        val root = RuntimeException(null as String?)
        val wrapper = RuntimeException(null, root)
        assertEquals("Something went wrong", UserFriendlyErrors.fromException(wrapper))
    }

    @Test
    fun `fromException with blank messages returns fallback`() {
        val ex = RuntimeException("   ")
        assertEquals("Something went wrong", UserFriendlyErrors.fromException(ex))
    }

    @Test
    fun `fromException with custom fallback`() {
        val ex = RuntimeException(null as String?)
        assertEquals("Network error", UserFriendlyErrors.fromException(ex, "Network error"))
    }

    @Test
    fun `fromException skips blank and finds first non-blank message`() {
        val root = RuntimeException("timeout occurred")
        val middle = RuntimeException("", root)
        val outer = RuntimeException("  ", middle)
        // generateSequence: outer("  ") → middle("") → root("timeout occurred")
        // mapNotNull message → ["  ", "", "timeout occurred"]
        // firstOrNull { isNotBlank } → "timeout occurred"
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromException(outer))
    }
}
