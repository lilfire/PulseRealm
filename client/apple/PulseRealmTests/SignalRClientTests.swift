import XCTest


final class SignalRClientTests: XCTestCase {

    // MARK: - buildWebSocketUrl

    func testBuildWebSocketUrlFromHttp() {
        let url = SignalRClient.buildWebSocketUrl(baseUrl: "http://192.168.1.10:5062", connectionToken: "abc123")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.scheme, "ws")
        XCTAssertEqual(url?.host, "192.168.1.10")
        XCTAssertEqual(url?.port, 5062)
        XCTAssertTrue(url?.absoluteString.contains("id=abc123") ?? false)
    }

    func testBuildWebSocketUrlFromHttps() {
        let url = SignalRClient.buildWebSocketUrl(baseUrl: "https://pulserealm.example.com", connectionToken: "tok")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.scheme, "wss")
        XCTAssertEqual(url?.host, "pulserealm.example.com")
        XCTAssertTrue(url?.absoluteString.contains("id=tok") ?? false)
    }

    func testBuildWebSocketUrlEncodesToken() {
        let url = SignalRClient.buildWebSocketUrl(baseUrl: "http://localhost:5062", connectionToken: "a b+c")
        XCTAssertNotNil(url)
        // Token should be percent-encoded
        let urlString = url?.absoluteString ?? ""
        XCTAssertFalse(urlString.contains(" "))
    }

    func testBuildWebSocketUrlPathIncludesHub() {
        let url = SignalRClient.buildWebSocketUrl(baseUrl: "http://localhost:5062", connectionToken: "token")
        XCTAssertNotNil(url)
        XCTAssertTrue(url?.path.contains("/hubs/realm") ?? false)
    }

    func testBuildWebSocketUrlNoScheme() {
        // URL without http/https prefix — should still produce a result with the path appended
        let url = SignalRClient.buildWebSocketUrl(baseUrl: "localhost:5062", connectionToken: "t")
        // The function doesn't add a scheme for bare URLs, so the URL may still be valid
        // depending on Foundation's URL parsing
        if let url = url {
            XCTAssertTrue(url.absoluteString.contains("hubs/realm"))
        }
    }

    // MARK: - Initial State

    func testInitialConnectionState() {
        let client = SignalRClient()
        XCTAssertEqual(client.connectionState, .disconnected)
        XCTAssertNil(client.error)
        XCTAssertFalse(client.realmStarted)
        XCTAssertFalse(client.eliminated)
    }

    func testClearError() {
        let client = SignalRClient()
        client.clearError()
        // Should not crash; error remains nil
        XCTAssertNil(client.error)
    }

    // MARK: - SignalRMessage Codable

    func testDecodeInvocationMessage() throws {
        let json = """
        {"type":1,"target":"RealmStarted","arguments":[],"invocationId":null,"result":null,"error":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 1)
        XCTAssertEqual(msg.target, "RealmStarted")
        XCTAssertNil(msg.invocationId)
    }

    func testDecodeCompletionMessage() throws {
        let json = """
        {"type":3,"invocationId":"1","result":null,"error":null,"target":null,"arguments":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 3)
        XCTAssertEqual(msg.invocationId, "1")
        XCTAssertNil(msg.error)
    }

    func testDecodeCompletionWithError() throws {
        let json = """
        {"type":3,"invocationId":"2","error":"Realm not found","result":null,"target":null,"arguments":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 3)
        XCTAssertEqual(msg.error, "Realm not found")
    }

    func testDecodePingMessage() throws {
        let json = """
        {"type":6,"invocationId":null,"target":null,"arguments":null,"result":null,"error":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 6)
    }

    func testDecodeCloseMessage() throws {
        let json = """
        {"type":7,"error":"Server shutting down","invocationId":null,"target":null,"arguments":null,"result":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 7)
        XCTAssertEqual(msg.error, "Server shutting down")
    }

    func testDecodeInvocationWithArguments() throws {
        let json = """
        {"type":1,"target":"ClientEliminated","arguments":["client-123"],"invocationId":null,"result":null,"error":null}
        """
        let msg = try JSONDecoder().decode(SignalRMessage.self, from: Data(json.utf8))
        XCTAssertEqual(msg.type, 1)
        XCTAssertEqual(msg.target, "ClientEliminated")
        XCTAssertEqual(msg.arguments?.count, 1)
        XCTAssertEqual(msg.arguments?.first?.value as? String, "client-123")
    }
}

// MARK: - SignalRError Tests

final class SignalRErrorTests: XCTestCase {

    func testInvalidUrlDescription() {
        let error = SignalRError.invalidUrl
        XCTAssertEqual(error.errorDescription, "Invalid server URL.")
    }

    func testNegotiateFailedDescription() {
        let error = SignalRError.negotiateFailed("HTTP 500")
        XCTAssertEqual(error.errorDescription, "Negotiate failed: HTTP 500")
    }

    func testHandshakeFailedDescription() {
        let error = SignalRError.handshakeFailed("Protocol mismatch")
        XCTAssertEqual(error.errorDescription, "Handshake failed: Protocol mismatch")
    }

    func testNotConnectedDescription() {
        let error = SignalRError.notConnected
        XCTAssertEqual(error.errorDescription, "Not connected to server.")
    }

    func testInvocationErrorDescription() {
        let error = SignalRError.invocationError("Realm full")
        XCTAssertEqual(error.errorDescription, "Server error: Realm full")
    }

    func testServerClosedWithMessage() {
        let error = SignalRError.serverClosed("Maintenance")
        XCTAssertEqual(error.errorDescription, "Server closed: Maintenance")
    }

    func testServerClosedWithoutMessage() {
        let error = SignalRError.serverClosed(nil)
        XCTAssertEqual(error.errorDescription, "Server closed the connection.")
    }

    func testTimeoutDescription() {
        let error = SignalRError.timeout
        XCTAssertEqual(error.errorDescription, "Request timed out.")
    }

    func testConformsToLocalizedError() {
        let error: LocalizedError = SignalRError.timeout
        XCTAssertNotNil(error.errorDescription)
    }
}
