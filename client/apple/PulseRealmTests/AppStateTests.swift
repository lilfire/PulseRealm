import XCTest
@testable import PulseRealm_Watch_App

@MainActor
final class AppStateTests: XCTestCase {

    // MARK: - Initialization

    func testInitGeneratesClientId() {
        let state = AppState()
        XCTAssertFalse(state.clientId.isEmpty)
        XCTAssertTrue(state.clientId.hasPrefix("watch-"))
    }

    func testInitWithoutSavedProfileShowsProfileSetup() {
        // Clear any saved profile data
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "pulserealm.profile.name")
        defaults.removeObject(forKey: "pulserealm.profile.heightCm")
        defaults.removeObject(forKey: "pulserealm.profile.weightKg")
        defaults.removeObject(forKey: "pulserealm.clientId")

        let state = AppState()
        if case .profileSetup = state.screen {} else {
            XCTFail("Expected profileSetup screen, got \(state.screen)")
        }
        XCTAssertNil(state.profile)
    }

    // MARK: - Profile

    func testSaveProfileUpdatesStateAndNavigates() {
        let state = AppState()
        let profile = ClientProfile(clientId: "temp", name: "Test User", heightCm: 175, weightKg: 80)

        state.saveProfile(profile)

        XCTAssertNotNil(state.profile)
        XCTAssertEqual(state.profile?.name, "Test User")
        XCTAssertEqual(state.profile?.heightCm, 175)
        XCTAssertEqual(state.profile?.weightKg, 80)
        // clientId should be overwritten with state's clientId
        XCTAssertEqual(state.profile?.clientId, state.clientId)

        if case .serverDiscovery = state.screen {} else {
            XCTFail("Expected serverDiscovery screen after saving profile")
        }
    }

    func testSaveProfilePersistsToUserDefaults() {
        let state = AppState()
        let profile = ClientProfile(clientId: "temp", name: "Persisted", heightCm: 165, weightKg: 55)

        state.saveProfile(profile)

        let defaults = UserDefaults.standard
        XCTAssertEqual(defaults.string(forKey: "pulserealm.profile.name"), "Persisted")
        XCTAssertEqual(defaults.double(forKey: "pulserealm.profile.heightCm"), 165)
        XCTAssertEqual(defaults.double(forKey: "pulserealm.profile.weightKg"), 55)
    }

    func testSaveProfileOverridesClientId() {
        let state = AppState()
        let profile = ClientProfile(clientId: "wrong-id", name: "Override", heightCm: 170, weightKg: 70)

        state.saveProfile(profile)

        XCTAssertEqual(state.profile?.clientId, state.clientId)
        XCTAssertNotEqual(state.profile?.clientId, "wrong-id")
    }

    // MARK: - Navigation

    func testSelectServer() {
        let state = AppState()
        state.selectServer("http://192.168.1.10:5062")

        if case .joinRealm(let url) = state.screen {
            XCTAssertEqual(url, "http://192.168.1.10:5062")
        } else {
            XCTFail("Expected joinRealm screen")
        }
    }

    func testSelectServerWithDifferentUrls() {
        let state = AppState()

        state.selectServer("http://10.0.0.1:5062")
        if case .joinRealm(let url) = state.screen {
            XCTAssertEqual(url, "http://10.0.0.1:5062")
        } else {
            XCTFail("Expected joinRealm screen")
        }

        state.selectServer("https://pulserealm.example.com")
        if case .joinRealm(let url) = state.screen {
            XCTAssertEqual(url, "https://pulserealm.example.com")
        } else {
            XCTFail("Expected joinRealm screen")
        }
    }

    // MARK: - Leave Realm

    func testLeaveRealmNavigatesBackToJoinScreen() async {
        let state = AppState()
        // Simulate being in a realm
        state.screen = .inRealm(realmId: "realm-1", serverUrl: "http://localhost:5062")

        await state.leaveRealm()

        if case .joinRealm(let url) = state.screen {
            XCTAssertEqual(url, "http://localhost:5062")
        } else {
            XCTFail("Expected joinRealm screen preserving server URL")
        }
    }

    func testLeaveRealmFromNonRealmNavigatesToDiscovery() async {
        let state = AppState()
        state.screen = .serverDiscovery

        await state.leaveRealm()

        if case .serverDiscovery = state.screen {} else {
            XCTFail("Expected serverDiscovery screen")
        }
    }

    func testLeaveRealmCancelsStreaming() async {
        let state = AppState()
        state.screen = .inRealm(realmId: "r1", serverUrl: "http://localhost:5062")
        state.startStreaming(realmId: "r1")
        XCTAssertNotNil(state.streamingTask)

        await state.leaveRealm()

        XCTAssertNil(state.streamingTask)
    }

    // MARK: - Streaming

    func testStartStreamingCreatesTask() {
        let state = AppState()
        state.startStreaming(realmId: "test-realm")
        XCTAssertNotNil(state.streamingTask)
        // Cleanup
        state.streamingTask?.cancel()
        state.streamingTask = nil
    }

    func testStartStreamingReplacesExistingTask() {
        let state = AppState()
        state.startStreaming(realmId: "realm-1")
        let firstTask = state.streamingTask

        state.startStreaming(realmId: "realm-2")
        let secondTask = state.streamingTask

        // The old task should have been cancelled and replaced
        XCTAssertNotNil(secondTask)
        XCTAssertTrue(firstTask?.isCancelled ?? true)
        // Cleanup
        state.streamingTask?.cancel()
        state.streamingTask = nil
    }

    // MARK: - Dependencies

    func testDependenciesInitialized() {
        let state = AppState()
        XCTAssertNotNil(state.signalR)
        XCTAssertNotNil(state.healthKit)
        XCTAssertNotNil(state.discovery)
    }
}
