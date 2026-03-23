import Foundation

private enum UserDefaultsKey {
    static let clientId = "pulserealm.clientId"
    static let profileName = "pulserealm.profile.name"
    static let profileHeightCm = "pulserealm.profile.heightCm"
    static let profileWeightKg = "pulserealm.profile.weightKg"
}

/// Central application state coordinating navigation, SignalR, HealthKit, and server discovery.
@MainActor
final class AppState: ObservableObject {

    // MARK: Published State

    @Published var screen: AppScreen = .profileSetup
    @Published var profile: ClientProfile?

    // MARK: Dependencies

    let signalR = SignalRClient()
    let healthKit = HealthKitManager()
    let discovery = ServerDiscoveryManager()

    // MARK: Identity

    let clientId: String

    // MARK: Private

    var streamingTask: Task<Void, Never>?

    // MARK: Init

    init() {
        // Load or generate a stable client identifier.
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: UserDefaultsKey.clientId) {
            clientId = existing
        } else {
            let short = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)
            let generated = "watch-\(short)"
            defaults.set(generated, forKey: UserDefaultsKey.clientId)
            clientId = generated
        }

        // Restore saved profile.
        if let name = defaults.string(forKey: UserDefaultsKey.profileName),
           !name.isEmpty {
            let heightCm = defaults.double(forKey: UserDefaultsKey.profileHeightCm)
            let weightKg = defaults.double(forKey: UserDefaultsKey.profileWeightKg)
            profile = ClientProfile(
                clientId: clientId,
                name: name,
                heightCm: heightCm > 0 ? heightCm : 170,
                weightKg: weightKg > 0 ? weightKg : 70
            )
            screen = .serverDiscovery
        }
    }

    // MARK: - Profile

    /// Persists the profile to UserDefaults and navigates to server discovery.
    func saveProfile(_ p: ClientProfile) {
        var saved = p
        saved.clientId = clientId
        self.profile = saved

        let defaults = UserDefaults.standard
        defaults.set(saved.name, forKey: UserDefaultsKey.profileName)
        defaults.set(saved.heightCm, forKey: UserDefaultsKey.profileHeightCm)
        defaults.set(saved.weightKg, forKey: UserDefaultsKey.profileWeightKg)

        screen = .serverDiscovery
    }

    // MARK: - Navigation

    /// Stores the chosen server URL and navigates to the join code screen.
    func selectServer(_ url: String) {
        screen = .joinRealm(serverUrl: url)
    }

    // MARK: - Realm Lifecycle

    /// Connects to the server, sends JoinRealm, fetches realm info via REST, then starts streaming.
    func join(joinCode: String, serverUrl: String) async {
        // Connect SignalR
        await signalR.connect(serverUrl: serverUrl)

        guard signalR.connectionState == .connected else {
            // Error already set by SignalRClient
            return
        }

        // Send JoinRealm hub invocation
        do {
            try await signalR.joinRealm(joinCode: joinCode, clientId: clientId, profile: profile)
        } catch {
            signalR.error = error.localizedDescription
            return
        }

        // Fetch realm info from REST endpoint
        guard let realmInfo = await fetchRealmInfo(serverUrl: serverUrl, joinCode: joinCode) else {
            signalR.error = "Could not fetch realm information."
            return
        }

        // Navigate to in-realm screen
        screen = .inRealm(realmId: realmInfo.id, serverUrl: serverUrl)

        // Start HealthKit
        await healthKit.requestAuthorization()
        await healthKit.startCollection()

        // Start streaming loop
        startStreaming(realmId: realmInfo.id)
    }

    /// Stops streaming, HealthKit, and SignalR; navigates back to the join screen.
    func leaveRealm() async {
        streamingTask?.cancel()
        streamingTask = nil

        await healthKit.stopCollection()
        await signalR.leaveRealm()
        await signalR.disconnect()

        // Navigate back preserving the server URL
        if case .inRealm(_, let serverUrl) = screen {
            screen = .joinRealm(serverUrl: serverUrl)
        } else {
            screen = .serverDiscovery
        }
    }

    // MARK: - Streaming Loop

    /// Launches a Task that sends wearable data to the server every 2 seconds.
    func startStreaming(realmId: String) {
        streamingTask?.cancel()
        streamingTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard let self else { break }
                let iso = ISO8601DateFormatter().string(from: Date())
                let data = WearableData(
                    clientId: self.clientId,
                    heartRate: self.healthKit.heartRate,
                    steps: self.healthKit.steps,
                    timestamp: iso
                )
                self.signalR.sendWearableData(realmId: realmId, data: data)
                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            }
        }
    }

    // MARK: - REST Helpers

    private func fetchRealmInfo(serverUrl: String, joinCode: String) async -> RealmInfo? {
        let base = serverUrl.hasSuffix("/") ? String(serverUrl.dropLast()) : serverUrl
        guard let url = URL(string: "\(base)/api/realm/\(joinCode)") else { return nil }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            return try JSONDecoder().decode(RealmInfo.self, from: data)
        } catch {
            return nil
        }
    }
}
