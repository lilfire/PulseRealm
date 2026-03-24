import Foundation
import HealthKit
import CoreMotion

/// Manages HealthKit workout session data collection and pedometer step counting.
///
/// On simulator (where HealthKit is unavailable) this class runs a deterministic
/// simulation loop so the rest of the app can be exercised without hardware.
@MainActor
final class HealthKitManager: NSObject, ObservableObject {

    // MARK: Published State

    @Published var heartRate: Int = 0
    @Published var steps: Int = 0
    @Published var isAuthorized: Bool = false
    @Published var isCollecting: Bool = false

    // MARK: Private

    private let healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    private let pedometer = CMPedometer()

    private var simulationTask: Task<Void, Never>?
    private var simulationStepBase: Int = 0

    private static let heartRateType = HKQuantityType(.heartRate)
    private static let stepCountType = HKQuantityType(.stepCount)

    // MARK: - Authorization

    /// Requests HealthKit read access for heart rate and step count, plus workout sharing.
    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            // Simulator path — mark authorized so the app proceeds.
            isAuthorized = true
            return
        }

        let typesToShare: Set<HKSampleType> = [HKWorkoutType.workoutType()]
        let typesToRead: Set<HKObjectType> = [
            Self.heartRateType,
            Self.stepCountType,
            HKWorkoutType.workoutType()
        ]

        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)
            isAuthorized = true
        } catch {
            isAuthorized = false
        }
    }

    // MARK: - Collection Lifecycle

    /// Starts a running workout session and begins collecting live heart rate and step data.
    func startCollection() async {
        guard !isCollecting else { return }

        guard HKHealthStore.isHealthDataAvailable() else {
            startSimulation()
            isCollecting = true
            return
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()

            session.delegate = self
            builder.delegate = self
            builder.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )

            self.workoutSession = session
            self.workoutBuilder = builder

            session.startActivity(with: Date())
            try await builder.beginCollection(at: Date())

            startPedometer()
            isCollecting = true
        } catch {
            // Fall back to simulation if session creation fails.
            startSimulation()
            isCollecting = true
        }
    }

    /// Stops the workout session, builder, and pedometer.
    func stopCollection() async {
        guard isCollecting else { return }
        isCollecting = false

        if HKHealthStore.isHealthDataAvailable() {
            workoutSession?.end()
            try? await workoutBuilder?.endCollection(at: Date())
            try? await workoutBuilder?.finishWorkout()
            workoutSession = nil
            workoutBuilder = nil
            pedometer.stopUpdates()
        } else {
            stopSimulation()
        }
    }

    // MARK: - Pedometer

    private func startPedometer() {
        guard CMPedometer.isStepCountingAvailable() else { return }
        pedometer.startUpdates(from: Date()) { [weak self] pedometerData, _ in
            guard let self, let data = pedometerData else { return }
            let stepValue = data.numberOfSteps.intValue
            Task { @MainActor [weak self] in
                self?.steps = stepValue
            }
        }
    }

    // MARK: - Simulation (Simulator / No HealthKit)

    private func startSimulation() {
        simulationStepBase = 0
        simulationTask = Task { @MainActor [weak self] in
            var tick = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
                guard let self, !Task.isCancelled else { break }
                tick += 1
                // Heart rate oscillates between 80 and 160
                let hr = 80 + Int(40.0 * (sin(Double(tick) / 10.0) + 1.0))
                // Steps increment ~2–3 per second (roughly 120–180 steps/min)
                let stepDelta = 2 + (tick % 3 == 0 ? 1 : 0)
                self.heartRate = hr
                self.steps = self.steps + stepDelta
            }
        }
    }

    private func stopSimulation() {
        simulationTask?.cancel()
        simulationTask = nil
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HealthKitManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // State transitions are handled implicitly; no additional action needed.
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didFailWithError error: Error
    ) {
        Task { @MainActor [weak self] in
            self?.isCollecting = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension HealthKitManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Not needed for heart rate streaming.
    }

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        if collectedTypes.contains(Self.heartRateType) {
            let unit = HKUnit.count().unitDivided(by: .minute())
            if let quantity = workoutBuilder.statistics(for: Self.heartRateType)?
                .mostRecentQuantity() {
                let hrValue = Int(quantity.doubleValue(for: unit))
                Task { @MainActor [weak self] in
                    self?.heartRate = hrValue
                }
            }
        }
    }
}
