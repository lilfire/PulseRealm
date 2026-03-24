import XCTest


final class ServerDiscoveryTests: XCTestCase {

    // MARK: - parseResponse

    func testParseValidResponse() {
        let json = """
        {"service":"PulseRealm","name":"MyPC","hostname":"mypc.local","urls":"http://+:5062","version":"1.0"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "192.168.1.10")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.name, "MyPC")
        XCTAssertEqual(result?.hostname, "mypc.local")
        XCTAssertEqual(result?.address, "192.168.1.10")
        XCTAssertEqual(result?.version, "1.0")
    }

    func testParseResponseExtractsPort() {
        let json = """
        {"service":"PulseRealm","name":"S","hostname":"s","urls":"http://+:8080","version":"2.0"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "10.0.0.1")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.httpUrl, "http://10.0.0.1:8080")
    }

    func testParseResponseWrongService() {
        let json = """
        {"service":"OtherApp","name":"X","hostname":"x","urls":"http://+:5062","version":"1.0"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "1.2.3.4")
        XCTAssertNil(result, "Should reject non-PulseRealm service")
    }

    func testParseResponseMissingService() {
        let json = """
        {"name":"NoService","hostname":"ns","urls":"http://+:5062","version":"1.0"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "1.2.3.4")
        XCTAssertNil(result, "Should reject response without service field matching PulseRealm")
    }

    func testParseResponseInvalidJSON() {
        let data = Data("not json".utf8)
        let result = ServerDiscoveryManager.parseResponse(data: data, senderIP: "1.2.3.4")
        XCTAssertNil(result)
    }

    func testParseResponseEmptyData() {
        let result = ServerDiscoveryManager.parseResponse(data: Data(), senderIP: "1.2.3.4")
        XCTAssertNil(result)
    }

    func testParseResponseDefaultsForMissingFields() {
        let json = """
        {"service":"PulseRealm"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "5.6.7.8")
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.name, "5.6.7.8") // Falls back to senderIP
        XCTAssertEqual(result?.hostname, "5.6.7.8") // Falls back to senderIP
        XCTAssertEqual(result?.version, "")
        XCTAssertEqual(result?.address, "5.6.7.8")
    }

    func testParseResponseDefaultUrls() {
        let json = """
        {"service":"PulseRealm","name":"S","hostname":"s"}
        """
        let result = ServerDiscoveryManager.parseResponse(data: Data(json.utf8), senderIP: "10.0.0.1")
        XCTAssertNotNil(result)
        // Default urls is "http://+:5062" → port 5062
        XCTAssertEqual(result?.httpUrl, "http://10.0.0.1:5062")
    }

    // MARK: - DiscoveryResponse Codable

    func testDiscoveryResponseDecode() throws {
        let json = """
        {"service":"PulseRealm","name":"Test","hostname":"test.local","urls":"http://+:5062","version":"1.2.3"}
        """
        let response = try JSONDecoder().decode(DiscoveryResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.service, "PulseRealm")
        XCTAssertEqual(response.name, "Test")
        XCTAssertEqual(response.hostname, "test.local")
        XCTAssertEqual(response.urls, "http://+:5062")
        XCTAssertEqual(response.version, "1.2.3")
    }

    func testDiscoveryResponseDecodePartial() throws {
        let json = """
        {"service":"PulseRealm"}
        """
        let response = try JSONDecoder().decode(DiscoveryResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.service, "PulseRealm")
        XCTAssertNil(response.name)
        XCTAssertNil(response.hostname)
        XCTAssertNil(response.urls)
        XCTAssertNil(response.version)
    }

    // MARK: - ServerDiscoveryManager State

    @MainActor
    func testInitialState() {
        let manager = ServerDiscoveryManager()
        XCTAssertFalse(manager.isScanning)
        XCTAssertTrue(manager.discoveredServers.isEmpty)
    }
}
