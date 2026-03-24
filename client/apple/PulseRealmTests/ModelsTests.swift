import XCTest


final class ClientProfileTests: XCTestCase {

    func testEncodeDecode() throws {
        let profile = ClientProfile(clientId: "watch-ABC123", name: "Alice", heightCm: 170, weightKg: 65)
        let data = try JSONEncoder().encode(profile)
        let decoded = try JSONDecoder().decode(ClientProfile.self, from: data)
        XCTAssertEqual(decoded.clientId, "watch-ABC123")
        XCTAssertEqual(decoded.name, "Alice")
        XCTAssertEqual(decoded.heightCm, 170)
        XCTAssertEqual(decoded.weightKg, 65)
    }

    func testDecodeFromJSON() throws {
        let json = """
        {"clientId":"w-1","name":"Bob","heightCm":180.5,"weightKg":75.2}
        """
        let profile = try JSONDecoder().decode(ClientProfile.self, from: Data(json.utf8))
        XCTAssertEqual(profile.clientId, "w-1")
        XCTAssertEqual(profile.name, "Bob")
        XCTAssertEqual(profile.heightCm, 180.5, accuracy: 0.01)
        XCTAssertEqual(profile.weightKg, 75.2, accuracy: 0.01)
    }

    func testMutability() {
        var profile = ClientProfile(clientId: "a", name: "A", heightCm: 170, weightKg: 70)
        profile.clientId = "b"
        profile.name = "B"
        XCTAssertEqual(profile.clientId, "b")
        XCTAssertEqual(profile.name, "B")
    }
}

final class WearableDataTests: XCTestCase {

    func testEncodeDecode() throws {
        let data = WearableData(clientId: "w-1", heartRate: 120, steps: 5000, timestamp: "2026-03-24T12:00:00Z")
        let encoded = try JSONEncoder().encode(data)
        let decoded = try JSONDecoder().decode(WearableData.self, from: encoded)
        XCTAssertEqual(decoded.clientId, "w-1")
        XCTAssertEqual(decoded.heartRate, 120)
        XCTAssertEqual(decoded.steps, 5000)
        XCTAssertEqual(decoded.timestamp, "2026-03-24T12:00:00Z")
    }

    func testDecodeFromJSON() throws {
        let json = """
        {"clientId":"c1","heartRate":85,"steps":1234,"timestamp":"2026-01-01T00:00:00Z"}
        """
        let wd = try JSONDecoder().decode(WearableData.self, from: Data(json.utf8))
        XCTAssertEqual(wd.heartRate, 85)
        XCTAssertEqual(wd.steps, 1234)
    }

    func testZeroValues() throws {
        let data = WearableData(clientId: "x", heartRate: 0, steps: 0, timestamp: "")
        let encoded = try JSONEncoder().encode(data)
        let decoded = try JSONDecoder().decode(WearableData.self, from: encoded)
        XCTAssertEqual(decoded.heartRate, 0)
        XCTAssertEqual(decoded.steps, 0)
    }
}

final class RealmInfoTests: XCTestCase {

    func testDecodeWithStatus() throws {
        let json = """
        {"id":"realm-1","joinCode":"123456","mode":"competition","status":"active"}
        """
        let info = try JSONDecoder().decode(RealmInfo.self, from: Data(json.utf8))
        XCTAssertEqual(info.id, "realm-1")
        XCTAssertEqual(info.joinCode, "123456")
        XCTAssertEqual(info.mode, "competition")
        XCTAssertEqual(info.status, "active")
    }

    func testDecodeWithoutStatus() throws {
        let json = """
        {"id":"r2","joinCode":"654321","mode":"social"}
        """
        let info = try JSONDecoder().decode(RealmInfo.self, from: Data(json.utf8))
        XCTAssertEqual(info.id, "r2")
        XCTAssertNil(info.status)
    }

    func testEncodeDecode() throws {
        let info = RealmInfo(id: "r3", joinCode: "111222", mode: "dungeon", status: nil)
        let data = try JSONEncoder().encode(info)
        let decoded = try JSONDecoder().decode(RealmInfo.self, from: data)
        XCTAssertEqual(decoded.id, "r3")
        XCTAssertEqual(decoded.joinCode, "111222")
        XCTAssertEqual(decoded.mode, "dungeon")
        XCTAssertNil(decoded.status)
    }
}

final class DiscoveredServerTests: XCTestCase {

    func testIdentifiable() {
        let server = DiscoveredServer(name: "MyPC", hostname: "mypc.local", urls: "http://+:5062", version: "1.0", address: "192.168.1.10")
        XCTAssertEqual(server.id, "192.168.1.10")
    }

    func testHttpUrlExtractsPort() {
        let server = DiscoveredServer(name: "S1", hostname: "s1", urls: "http://+:5062", version: "1.0", address: "10.0.0.5")
        XCTAssertEqual(server.httpUrl, "http://10.0.0.5:5062")
    }

    func testHttpUrlCustomPort() {
        let server = DiscoveredServer(name: "S2", hostname: "s2", urls: "http://+:8080", version: "2.0", address: "172.16.0.1")
        XCTAssertEqual(server.httpUrl, "http://172.16.0.1:8080")
    }

    func testHttpUrlFallbackPort() {
        let server = DiscoveredServer(name: "S3", hostname: "s3", urls: "noport", version: "1.0", address: "1.2.3.4")
        // "noport" has no colon, so components(separatedBy: ":").last is "noport"
        XCTAssertEqual(server.httpUrl, "http://1.2.3.4:noport")
    }
}

final class ConnectionStateTests: XCTestCase {

    func testEquatable() {
        XCTAssertEqual(ConnectionState.disconnected, ConnectionState.disconnected)
        XCTAssertEqual(ConnectionState.connecting, ConnectionState.connecting)
        XCTAssertEqual(ConnectionState.connected, ConnectionState.connected)
        XCTAssertEqual(ConnectionState.reconnecting, ConnectionState.reconnecting)
        XCTAssertNotEqual(ConnectionState.connected, ConnectionState.disconnected)
    }
}

final class AppScreenTests: XCTestCase {

    func testCases() {
        let screen1 = AppScreen.profileSetup
        let screen2 = AppScreen.serverDiscovery
        let screen3 = AppScreen.joinRealm(serverUrl: "http://localhost:5062")
        let screen4 = AppScreen.inRealm(realmId: "r1", serverUrl: "http://localhost:5062")

        // Verify associated values via pattern matching
        if case .joinRealm(let url) = screen3 {
            XCTAssertEqual(url, "http://localhost:5062")
        } else {
            XCTFail("Expected joinRealm")
        }

        if case .inRealm(let realmId, let serverUrl) = screen4 {
            XCTAssertEqual(realmId, "r1")
            XCTAssertEqual(serverUrl, "http://localhost:5062")
        } else {
            XCTFail("Expected inRealm")
        }

        // Ensure distinct cases
        if case .profileSetup = screen1 {} else { XCTFail("Expected profileSetup") }
        if case .serverDiscovery = screen2 {} else { XCTFail("Expected serverDiscovery") }
    }
}
