package com.pulserealm.client.data.network

/**
 * Converts raw exception messages into simple, user-friendly text
 * so the Android client never shows technical error details.
 */
object UserFriendlyErrors {

    fun fromException(e: Throwable, fallback: String = "Something went wrong"): String {
        val raw = extractBestMessage(e) ?: return fallback
        return fromRawMessage(raw, fallback)
    }

    fun fromRawMessage(raw: String?, fallback: String = "Something went wrong"): String {
        if (raw.isNullOrBlank()) return fallback

        val lower = raw.lowercase()

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
            lower.contains("404") || lower.contains("not found") ->
                "Realm not found — check the join code"

            lower.contains("500") || lower.contains("internal server error") ->
                "Server error — try again"

            lower.contains("503") || lower.contains("service unavailable") ->
                "Server is temporarily unavailable"

            // Realm / join errors — pass through server messages that are already user-friendly
            lower.contains("realm") || lower.contains("join code") || lower.contains("full") ||
            lower.contains("already started") || lower.contains("kicked") ->
                raw

            // Generic fallback
            else -> fallback
        }
    }

    /** Walk the exception cause chain to find the most useful message. */
    private fun extractBestMessage(e: Throwable): String? {
        return generateSequence<Throwable>(e) { it.cause }
            .mapNotNull { it.message }
            .firstOrNull { it.isNotBlank() }
    }
}
