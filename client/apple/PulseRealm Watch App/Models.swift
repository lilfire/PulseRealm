import Foundation

struct ClientProfile: Codable {
    var clientId: String
    var name: String
    var heightCm: Double
    var weightKg: Double
}

struct WearableData: Codable {
    var clientId: String
    var heartRate: Int
    var steps: Int
    var timestamp: String
}

struct RealmInfo: Codable {
    var id: String
    var joinCode: String
    var mode: String
    var status: String?
}

struct DiscoveredServer: Identifiable {
    var id: String { address }
    var name: String
    var hostname: String
    var urls: String
    var version: String
    var address: String  // IP address string

    var httpUrl: String {
        let port = urls.components(separatedBy: ":").last ?? "5062"
        return "http://\(address):\(port)"
    }
}

enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

enum AppScreen {
    case profileSetup
    case serverDiscovery
    case joinRealm(serverUrl: String)
    case inRealm(realmId: String, serverUrl: String)
}
