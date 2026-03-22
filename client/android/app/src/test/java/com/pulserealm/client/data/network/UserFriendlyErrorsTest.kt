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

    // ── fromRawMessage: server error messages (explicit allowlist) ─────

    @Test
    fun `invalid join code maps to friendly message`() {
        assertEquals(
            "Invalid join code — double-check and try again.",
            UserFriendlyErrors.fromRawMessage("Invalid join code.")
        )
    }

    @Test
    fun `realm not found maps to friendly message`() {
        assertEquals(
            "Realm not found — check the join code.",
            UserFriendlyErrors.fromRawMessage("Realm not found.")
        )
    }

    @Test
    fun `realm has ended maps to friendly message`() {
        assertEquals(
            "This realm has ended.",
            UserFriendlyErrors.fromRawMessage("Realm has ended.")
        )
    }

    @Test
    fun `realm has already started maps to friendly message`() {
        assertEquals(
            "This realm has already started.",
            UserFriendlyErrors.fromRawMessage("Realm has already started.")
        )
    }

    @Test
    fun `realm is full maps to friendly message`() {
        assertEquals(
            "Realm is full — no more players can join.",
            UserFriendlyErrors.fromRawMessage("Realm is full (8/8 players).")
        )
    }

    @Test
    fun `kicked maps to friendly message`() {
        assertEquals(
            "You were kicked from this realm.",
            UserFriendlyErrors.fromRawMessage("You have been kicked from this realm.")
        )
    }

    @Test
    fun `name blank maps to friendly message`() {
        assertEquals(
            "Name cannot be blank.",
            UserFriendlyErrors.fromRawMessage("Name cannot be blank or empty.")
        )
    }

    @Test
    fun `name too long maps to friendly message`() {
        assertEquals(
            "Name is too long (50 characters max).",
            UserFriendlyErrors.fromRawMessage("Name is too long (max 50 characters).")
        )
    }

    @Test
    fun `age validation maps to friendly message`() {
        assertEquals(
            "Age must be between 5 and 120.",
            UserFriendlyErrors.fromRawMessage("Age must be between 5 and 120.")
        )
    }

    @Test
    fun `height validation maps to friendly message`() {
        assertEquals(
            "Height must be between 50 and 250 cm.",
            UserFriendlyErrors.fromRawMessage("Height must be between 50 and 250 cm.")
        )
    }

    @Test
    fun `weight validation maps to friendly message`() {
        assertEquals(
            "Weight must be between 10 and 500 kg.",
            UserFriendlyErrors.fromRawMessage("Weight must be between 10 and 500 kg.")
        )
    }

    @Test
    fun `invalid host secret maps to friendly message`() {
        assertEquals(
            "Could not verify host — try again.",
            UserFriendlyErrors.fromRawMessage("Invalid host secret.")
        )
    }

    @Test
    fun `not authorized maps to friendly message`() {
        assertEquals(
            "Only the host can do that.",
            UserFriendlyErrors.fromRawMessage("Not authorized. Only the host can perform this action.")
        )
    }

    @Test
    fun `cannot bind after started maps to friendly message`() {
        assertEquals(
            "Cannot bind after the realm has started.",
            UserFriendlyErrors.fromRawMessage("Cannot bind after realm has started.")
        )
    }

    @Test
    fun `client already bound maps to friendly message`() {
        assertEquals(
            "This client is already bound.",
            UserFriendlyErrors.fromRawMessage("Client is already bound.")
        )
    }

    @Test
    fun `not in realm maps to friendly message`() {
        assertEquals(
            "You are not in a realm.",
            UserFriendlyErrors.fromRawMessage("Not in a realm.")
        )
    }

    @Test
    fun `no pending bind maps to friendly message`() {
        assertEquals(
            "No pending bind request.",
            UserFriendlyErrors.fromRawMessage("No pending bind request.")
        )
    }

    @Test
    fun `not bound to client maps to friendly message`() {
        assertEquals(
            "Not bound to this client.",
            UserFriendlyErrors.fromRawMessage("Not bound to this client.")
        )
    }

    // ── Unrecognized messages ALWAYS return fallback, never raw text ───

    @Test
    fun `unknown message with realm-like words still returns fallback`() {
        // Even if the message contains keywords, if it's not in the allowlist it gets the fallback
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage("java.lang.RuntimeException: realm state corrupted"))
    }

    @Test
    fun `unknown technical message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage("NullPointerException at com.foo.Bar"))
    }

    @Test
    fun `random unknown message returns fallback`() {
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage("some random error xyz"))
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

    @Test
    fun `server messages match case-insensitively`() {
        assertEquals(
            "Invalid join code — double-check and try again.",
            UserFriendlyErrors.fromRawMessage("INVALID JOIN CODE.")
        )
    }

    // ── fromException ───────────────────────────────────────────────────

    @Test
    fun `fromException with simple message`() {
        val ex = RuntimeException("Connection refused")
        assertEquals("Could not reach the server", UserFriendlyErrors.fromException(ex))
    }

    @Test
    fun `fromException with nested cause chain finds useful root cause`() {
        val root = java.net.SocketTimeoutException("timed out")
        val wrapper = RuntimeException("Something happened", root)
        val outer = Exception("Outer", wrapper)
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromException(outer))
    }

    @Test
    fun `fromException walks chain to find useful message`() {
        val root = RuntimeException("Connection refused")
        val wrapper = RuntimeException(null, root)
        val outer = Exception(null, wrapper)
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
        assertEquals("Server took too long to respond", UserFriendlyErrors.fromException(outer))
    }

    // ── SignalR HubException unwrapping ───────────────────────────────

    @Test
    fun `unwraps SignalR HubException wrapper for invalid join code`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Invalid join code."
        assertEquals("Invalid join code — double-check and try again.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for realm has ended`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Realm has ended."
        assertEquals("This realm has ended.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for realm already started`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Realm has already started."
        assertEquals("This realm has already started.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for realm is full`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Realm is full (8/8 players)."
        assertEquals("Realm is full — no more players can join.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for kicked`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: You have been kicked from this realm."
        assertEquals("You were kicked from this realm.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for name validation`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Name cannot be blank or empty."
        assertEquals("Name cannot be blank.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for age validation`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Age must be between 5 and 120."
        assertEquals("Age must be between 5 and 120.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for height validation`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Height must be between 50 and 250 cm."
        assertEquals("Height must be between 50 and 250 cm.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR HubException wrapper for weight validation`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Weight must be between 10 and 500 kg."
        assertEquals("Weight must be between 10 and 500 kg.", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps SignalR Exception wrapper with unknown message returns fallback`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. Exception: Something bad."
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `unwraps connection error inside HubException wrapper`() {
        val raw = "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Connection refused"
        assertEquals("Could not reach the server", UserFriendlyErrors.fromRawMessage(raw))
    }

    @Test
    fun `fromException unwraps HubException in exception message`() {
        val ex = RuntimeException("An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Invalid join code.")
        assertEquals("Invalid join code — double-check and try again.", UserFriendlyErrors.fromException(ex, "Could not join the realm"))
    }

    @Test
    fun `unwrapped but unrecognized HubException returns fallback not raw text`() {
        val raw = "An unexpected error occurred invoking 'Foo' on the server. HubException: some.internal.Error: stack trace garbage"
        assertEquals("Something went wrong", UserFriendlyErrors.fromRawMessage(raw))
    }
}
