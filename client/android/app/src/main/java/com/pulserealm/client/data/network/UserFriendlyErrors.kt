package com.pulserealm.client.data.network

/**
 * Converts raw exception messages into simple, user-friendly text
 * so the Android client never shows technical error details.
 */
object UserFriendlyErrors {

    /**
     * Regex to extract the inner message from SignalR's HubException wrapper.
     * Example: "An unexpected error occurred invoking 'JoinRealm' on the server. HubException: Invalid join code."
     * Extracts: "Invalid join code."
     */
    private val hubExceptionPattern = Regex(
        """(?:HubException|Exception):\s*(.+)""", RegexOption.IGNORE_CASE
    )

    /**
     * Explicit allowlist of server error messages mapped to user-friendly text.
     * Every known HubException message from the server must be listed here.
     * Messages are matched case-insensitively after trimming trailing periods.
     * The user-facing value is ALWAYS a human-written string — never a raw exception.
     */
    private val serverMessages: Map<String, String> = buildMap {
        // Join / realm errors
        put("invalid join code", "Invalid join code — double-check and try again.")
        put("realm not found", "Realm not found — check the join code.")
        put("realm has ended", "This realm has ended.")
        put("realm has already started", "This realm has already started.")
        put("you have been kicked from this realm", "You were kicked from this realm.")

        // Realm full — handled by pattern match below since it contains dynamic player count

        // Profile validation
        put("name cannot be blank or empty", "Name cannot be blank.")
        put("name is too long (max 50 characters)", "Name is too long (50 characters max).")
        put("age must be between 5 and 120", "Age must be between 5 and 120.")
        put("height must be between 50 and 250 cm", "Height must be between 50 and 250 cm.")
        put("weight must be between 10 and 500 kg", "Weight must be between 10 and 500 kg.")

        // Host / bind errors
        put("invalid host secret", "Could not verify host — try again.")
        put("not authorized. only the host can perform this action", "Only the host can do that.")
        put("cannot bind after realm has started", "Cannot bind after the realm has started.")
        put("client is already bound", "This client is already bound.")
        put("not in a realm", "You are not in a realm.")
        put("no pending bind request", "No pending bind request.")
        put("not bound to this client", "Not bound to this client.")
    }

    fun fromException(e: Throwable, fallback: String = "Something went wrong"): String {
        // Try each message in the cause chain — use the first that produces a
        // meaningful (non-fallback) result so useful inner causes aren't lost.
        val messages = generateSequence<Throwable>(e) { it.cause }
            .mapNotNull { it.message }
            .filter { it.isNotBlank() }
        for (msg in messages) {
            val result = fromRawMessage(msg, fallback)
            if (result != fallback) return result
        }
        return fallback
    }

    fun fromRawMessage(raw: String?, fallback: String = "Something went wrong"): String {
        if (raw.isNullOrBlank()) return fallback

        // If this looks like a SignalR wrapper, extract the inner message first
        val unwrapped = unwrapHubException(raw)
        val lower = unwrapped.lowercase().trimEnd('.')

        // Check exact match against known server messages
        serverMessages[lower]?.let { return it }

        return when {
            // Connection / network errors
            lower.contains("connection refused") ||
            lower.contains("econnrefused") ->
                "Could not reach the server"

            lower.contains("timeout") ||
            lower.contains("timed out") ||
            lower.contains("sockettimeout") ->
                "Server took too long to respond"

            lower.contains("unknown host") ||
            lower.contains("unknownhost") ||
            lower.contains("no address associated") ->
                "Server not found — check the address"

            lower.contains("network is unreachable") ||
            lower.contains("no route to host") ||
            lower.contains("enetunreach") ->
                "No network connection"

            lower.contains("ssl") ||
            lower.contains("certificate") ||
            lower.contains("handshake") ->
                "Secure connection failed"

            lower.contains("connection reset") ||
            lower.contains("broken pipe") ||
            lower.contains("econnreset") ->
                "Connection was interrupted"

            lower.contains("connection failed") ->
                "Could not connect to the server"

            // HTTP errors
            lower.contains("404") ->
                "Realm not found — check the join code"

            lower.contains("500") || lower.contains("internal server error") ->
                "Server error — try again"

            lower.contains("503") || lower.contains("service unavailable") ->
                "Server is temporarily unavailable"

            // Dynamic server messages (contain variable data like player counts)
            lower.startsWith("realm is full") ->
                "Realm is full — no more players can join."

            // Generic fallback — NEVER expose raw exception text
            else -> fallback
        }
    }

    /**
     * If the message is a SignalR HubException wrapper like
     * "An unexpected error occurred invoking 'X' on the server. HubException: Actual message."
     * extract and return just "Actual message." Otherwise return the original message.
     */
    private fun unwrapHubException(message: String): String {
        val match = hubExceptionPattern.find(message) ?: return message
        val inner = match.groupValues[1].trim()
        return if (inner.isNotBlank()) inner else message
    }
}
