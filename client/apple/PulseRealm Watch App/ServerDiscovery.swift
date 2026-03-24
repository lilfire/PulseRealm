import Foundation
import Darwin

// MARK: - UDP Discovery Response

struct DiscoveryResponse: Decodable {
    let service: String?
    let name: String?
    let hostname: String?
    let urls: String?
    let version: String?
}

// MARK: - ServerDiscoveryManager

/// Sends a UDP broadcast and collects PulseRealm server discovery responses.
///
/// Uses raw POSIX socket calls on a detached background thread because
/// `NWConnection` does not support sending to the broadcast address on watchOS.
@MainActor
final class ServerDiscoveryManager: ObservableObject {

    @Published var discoveredServers: [DiscoveredServer] = []
    @Published var isScanning: Bool = false

    private static let discoveryPort: UInt16 = 5063
    private static let listenDuration: TimeInterval = 8.0
    private static let payload = #"{"discover":"PulseRealm"}"#

    // MARK: - Public API

    /// Sends the discovery broadcast and listens for responses for 8 seconds.
    /// Discovered servers are deduplicated by IP address.
    func scan() async {
        guard !isScanning else { return }
        isScanning = true
        discoveredServers = []

        let found = await Task.detached(priority: .userInitiated) {
            return await ServerDiscoveryManager.performUDPScan()
        }.value

        // Deduplicate by IP address.
        var seen = Set<String>()
        var unique: [DiscoveredServer] = []
        for server in found {
            if seen.insert(server.address).inserted {
                unique.append(server)
            }
        }
        discoveredServers = unique
        isScanning = false
    }

    // MARK: - POSIX Socket Implementation

    /// Runs entirely on a background thread. Returns any discovered servers.
    private static func performUDPScan() -> [DiscoveredServer] {
        var results: [DiscoveredServer] = []

        // Create UDP socket.
        let sock = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard sock >= 0 else { return results }
        defer { Darwin.close(sock) }

        // Enable broadcast.
        var broadcast: Int32 = 1
        Darwin.setsockopt(sock, SOL_SOCKET, SO_BROADCAST, &broadcast, socklen_t(MemoryLayout<Int32>.size))

        // Set receive timeout so we don't block forever.
        var timeout = timeval(tv_sec: 1, tv_usec: 0)
        Darwin.setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        // Allow address reuse.
        var reuse: Int32 = 1
        Darwin.setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

        // Bind to any available port so we can receive replies.
        var bindAddr = sockaddr_in()
        bindAddr.sin_family = sa_family_t(AF_INET)
        bindAddr.sin_port = 0 // OS assigns a port
        bindAddr.sin_addr.s_addr = INADDR_ANY
        withUnsafePointer(to: &bindAddr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                Darwin.bind(sock, sockPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        // Build broadcast destination address.
        var destAddr = sockaddr_in()
        destAddr.sin_family = sa_family_t(AF_INET)
        destAddr.sin_port = in_port_t(discoveryPort).bigEndian
        destAddr.sin_addr.s_addr = INADDR_BROADCAST // 255.255.255.255

        // Send the discovery payload.
        let payloadData = Array(payload.utf8)
        payloadData.withUnsafeBytes { rawBuffer in
            guard let baseAddress = rawBuffer.baseAddress else { return }
            withUnsafePointer(to: &destAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                    Darwin.sendto(
                        sock,
                        baseAddress,
                        rawBuffer.count,
                        0,
                        sockPtr,
                        socklen_t(MemoryLayout<sockaddr_in>.size)
                    )
                }
            }
        }

        // Listen for responses until the timeout window expires.
        let deadline = Date().addingTimeInterval(listenDuration)
        var buffer = [UInt8](repeating: 0, count: 4096)

        while Date() < deadline {
            var senderAddr = sockaddr_in()
            var senderLen = socklen_t(MemoryLayout<sockaddr_in>.size)

            let received = buffer.withUnsafeMutableBytes { rawBuffer -> Int in
                guard let base = rawBuffer.baseAddress else { return -1 }
                return withUnsafeMutablePointer(to: &senderAddr) { ptr in
                    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                        Darwin.recvfrom(sock, base, rawBuffer.count, 0, sockPtr, &senderLen)
                    }
                }
            }

            if received > 0 {
                let data = Data(buffer[0..<received])
                let senderIP = ipString(from: senderAddr.sin_addr)

                if let server = parseResponse(data: data, senderIP: senderIP) {
                    results.append(server)
                }
            }
        }

        return results
    }

    static func parseResponse(data: Data, senderIP: String) -> DiscoveredServer? {
        guard let decoded = try? JSONDecoder().decode(DiscoveryResponse.self, from: data),
              decoded.service == "PulseRealm" else {
            return nil
        }

        // Extract the port from urls (e.g. "http://+:5062")
        let urls = decoded.urls ?? "http://+:5062"
        let port = urls.components(separatedBy: ":").last ?? "5062"

        return DiscoveredServer(
            name: decoded.name ?? senderIP,
            hostname: decoded.hostname ?? senderIP,
            urls: urls,
            version: decoded.version ?? "",
            address: senderIP
        )
    }

    // MARK: - Helpers

    static func ipString(from addr: in_addr) -> String {
        var mutableAddr = addr
        var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        inet_ntop(AF_INET, &mutableAddr, &buffer, socklen_t(INET_ADDRSTRLEN))
        return String(cString: buffer)
    }
}
