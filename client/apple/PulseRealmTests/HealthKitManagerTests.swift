import XCTest


@MainActor
final class HealthKitManagerTests: XCTestCase {

    // MARK: - Initial State

    func testInitialState() {
        let manager = HealthKitManager()
        XCTAssertEqual(manager.heartRate, 0)
        XCTAssertEqual(manager.steps, 0)
        XCTAssertFalse(manager.isAuthorized)
        XCTAssertFalse(manager.isCollecting)
    }

    // MARK: - Authorization (simulator path)

    func testRequestAuthorizationOnSimulator() async {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        // On simulator/test environment where HealthKit is unavailable,
        // isAuthorized should be set to true
        XCTAssertTrue(manager.isAuthorized)
    }

    // MARK: - Collection Lifecycle (simulator path)

    func testStartCollectionOnSimulator() async {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()
        XCTAssertTrue(manager.isCollecting)
    }

    func testStopCollectionOnSimulator() async {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()
        XCTAssertTrue(manager.isCollecting)

        await manager.stopCollection()
        XCTAssertFalse(manager.isCollecting)
    }

    func testStartCollectionIdempotent() async {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()
        await manager.startCollection() // Should not crash or change state
        XCTAssertTrue(manager.isCollecting)
        await manager.stopCollection()
    }

    func testStopCollectionWhenNotCollecting() async {
        let manager = HealthKitManager()
        // Should not crash
        await manager.stopCollection()
        XCTAssertFalse(manager.isCollecting)
    }

    // MARK: - Simulation Output

    func testSimulationProducesHeartRateAndSteps() async throws {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()

        // Wait for simulation to produce data (simulation ticks every 1 second)
        try await Task.sleep(nanoseconds: 2_500_000_000)

        // After ~2.5 seconds, simulation should have updated values
        XCTAssertGreaterThan(manager.heartRate, 0, "Heart rate should be > 0 after simulation")
        XCTAssertGreaterThan(manager.steps, 0, "Steps should be > 0 after simulation")

        // Heart rate should be in simulation range (80-160)
        XCTAssertGreaterThanOrEqual(manager.heartRate, 80)
        XCTAssertLessThanOrEqual(manager.heartRate, 160)

        await manager.stopCollection()
    }

    func testSimulationStepsIncrease() async throws {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()

        try await Task.sleep(nanoseconds: 1_500_000_000)
        let steps1 = manager.steps

        try await Task.sleep(nanoseconds: 1_500_000_000)
        let steps2 = manager.steps

        XCTAssertGreaterThan(steps2, steps1, "Steps should increase over time")

        await manager.stopCollection()
    }

    func testSimulationStopsAfterStopCollection() async throws {
        let manager = HealthKitManager()
        await manager.requestAuthorization()
        await manager.startCollection()

        try await Task.sleep(nanoseconds: 1_500_000_000)
        await manager.stopCollection()

        let stepsAfterStop = manager.steps
        try await Task.sleep(nanoseconds: 1_500_000_000)
        let stepsLater = manager.steps

        XCTAssertEqual(stepsAfterStop, stepsLater, "Steps should not change after stopping")
    }
}
