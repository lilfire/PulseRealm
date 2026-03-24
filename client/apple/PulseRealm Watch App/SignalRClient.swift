import Foundation

// MARK: - SignalR Message Types

struct SignalRMessage: Codable {
    let type: Int
    let invocationId: String?
    let target: String?
    let arguments: [AnyCodable]?
    let result: AnyCodable?
    let error: String?
}

/// Type-erased Codable wrapper for arbitrary JSON values.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let dictValue = try? container.decode([String: AnyCodable].self) {
            value = dictValue.mapValues { $0.value }
        } else if let arrayValue = try? container.decode([AnyCodable].self) {
            value = arrayValue.map { $0.value }
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let intValue as Int:
            try container.encode(intValue)
        case let doubleValue as Double:
            try container.encode(doubleValue)
        case let boolValue as Bool:
            try container.encode(boolValue)
        case let stringValue as String:
            try container.encode(stringValue)
        case let dictValue as [String: Any]:
            let wrapped = dictValue.mapValues { AnyCodable($0) }
            try container.encode(wrapped)
        case let arrayValue as [Any]:
            let wrapped = arrayValue.map { AnyCodable($0) }
            try container.encode(wrapped)
        case is NSNull:
            try container.encodeNil()
        default:
            try container.encodeNil()
        }
    }
}

// MARK: - SignalR Invocation Helpers

private struct InvocationMessage: Encodable {
    let type: Int = 1
    let invocationId: String?
    let target: String
    let arguments: [AnyCodable]

    init(invocationId: String? = nil, target: String, arguments: [AnyCodable]) {
        self.invocationId = invocationId
        self.target = target
        self.arguments = arguments
    }
}

private struct HandshakeRequest: Encodable {
    let `protocol`: String
    let version: Int
}

private struct PingMessage: Encodable {
    let type: Int = 6
}

// MARK: - SignalRClient

/// Full-featured SignalR JSON-over-WebSocket client for PulseRealm.
///
/// Handles negotiation, handshake, hub method invocations, server-push events,
/// pinging, and automatic exponential-backoff reconnection.
final class SignalRClient: NSObject, ObservableObject {

    // MARK: Published State
    // All mutations go through MainActor.run to keep UI updates on the main thread.

    @Published var connectionState: ConnectionState = .disconnected
    @Published var error: String?
    @Published var realmStarted: Bool = false
    @Published var eliminated: Bool = false

    // MARK: Private State

    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var pingTask: Task<Void, Never>?
    private var readLoopTask: Task<Void, Never>?

    /// Continuations awaiting a Completion (type 3) from the server, keyed by invocationId.
    private var pendingCompletions: [String: CheckedContinuation<AnyCodable?, Error>] = [:]

    /// Whether the disconnect was intentional (suppresses reconnect).
    private var intentionalDisconnect: Bool = false

    /// Reconnect state
    private var reconnectAttempt: Int = 0
    private let maxReconnectAttempts: Int = 8
    private let reconnectDelays: [TimeInterval] = [2, 4, 8, 16, 30, 30, 30, 30]

    /// Stored for reconnection
    private var currentServerUrl: String?
    private var storedJoinCode: String?
    private var storedClientId: String?
    private var storedProfile: ClientProfile?

    private var invocationCounter: Int = 0

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private static let recordSeparator: Character = "\u{1e}"
    private static let recordSeparatorString: String = "\u{1e}"

    // MARK: Init

    override init() {
        super.init()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Public API

    /// Connects to the server. Performs negotiate → WebSocket connect → handshake.
    func connect(serverUrl: String) async {
        await MainActor.run { connectionState = .connecting }
        currentServerUrl = serverUrl
        intentionalDisconnect = false
        reconnectAttempt = 0

        do {
            try await performConnect(serverUrl: serverUrl)
        } catch {
            await handleConnectionFailure(error)
        }
    }

    /// Sends JoinRealm hub method and awaits the server Completion response.
    func joinRealm(joinCode: String, clientId: String, profile: ClientProfile?) async throws {
        storedJoinCode = joinCode
        storedClientId = clientId
        storedProfile = profile

        let invId = nextInvocationId()

        let profileArg: AnyCodable
        if let p = profile {
            profileArg = AnyCodable([
                "clientId": p.clientId,
                "name": p.name,
                "heightCm": p.heightCm,
                "weightKg": p.weightKg
            ] as [String: Any])
        } else {
            profileArg = AnyCodable(NSNull())
        }

        let msg = InvocationMessage(
            invocationId: invId,
            target: "JoinRealm",
            arguments: [
                AnyCodable(joinCode),
                AnyCodable(clientId),
                profileArg
            ]
        )

        let result = try await sendWithCompletion(message: msg, invocationId: invId, timeout: 10)
        // Server returns void or bool; treat non-error completion as success.
        _ = result
    }

    /// Sends wearable data as a fire-and-forget invocation. Non-throwing, safe to call from sync context.
    func sendWearableData(realmId: String, data: WearableData) {
        let dataArg = AnyCodable([
            "clientId": data.clientId,
            "heartRate": data.heartRate,
            "steps": data.steps,
            "timestamp": data.timestamp
        ] as [String: Any])

        let msg = InvocationMessage(
            invocationId: nil,
            target: "SendWearableData",
            arguments: [AnyCodable(realmId), dataArg]
        )

        Task {
            try? await sendMessage(msg)
        }
    }

    /// Sends LeaveRealm and awaits completion.
    func leaveRealm() async {
        let invId = nextInvocationId()
        let msg = InvocationMessage(invocationId: invId, target: "LeaveRealm", arguments: [])
        _ = try? await sendWithCompletion(message: msg, invocationId: invId, timeout: 5)
    }

    /// Intentionally disconnects, cancelling reconnect attempts.
    func disconnect() async {
        intentionalDisconnect = true
        await cleanupConnection()
        await MainActor.run { connectionState = .disconnected }
    }

    func clearError() {
        Task { @MainActor [weak self] in
            self?.error = nil
        }
    }

    // MARK: - Connection Implementation

    private func performConnect(serverUrl: String) async throws {
        // Step 1: Negotiate
        let connectionToken = try await negotiate(serverUrl: serverUrl)

        // Step 2: Build WebSocket URL
        let baseUrl = serverUrl.hasSuffix("/") ? String(serverUrl.dropLast()) : serverUrl
        guard let wsUrl = Self.buildWebSocketUrl(baseUrl: baseUrl, connectionToken: connectionToken) else {
            throw SignalRError.invalidUrl
        }

        // Step 3: Connect WebSocket
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.urlSession = session
        let task = session.webSocketTask(with: wsUrl)
        self.webSocketTask = task
        task.resume()

        // Step 4: Send handshake
        try await sendHandshake()

        // Step 5: Start read loop and ping
        startReadLoop()
        startPing()

        await MainActor.run {
            connectionState = .connected
            error = nil
        }

        reconnectAttempt = 0
    }

    private func negotiate(serverUrl: String) async throws -> String {
        let baseUrl = serverUrl.hasSuffix("/") ? String(serverUrl.dropLast()) : serverUrl
        guard let url = URL(string: "\(baseUrl)/hubs/realm/negotiate?negotiateVersion=1") else {
            throw SignalRError.invalidUrl
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw SignalRError.negotiateFailed("HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["connectionToken"] as? String else {
            throw SignalRError.negotiateFailed("Missing connectionToken")
        }

        return token
    }

    static func buildWebSocketUrl(baseUrl: String, connectionToken: String) -> URL? {
        var wsBase = baseUrl
        if wsBase.hasPrefix("https://") {
            wsBase = "wss://" + wsBase.dropFirst("https://".count)
        } else if wsBase.hasPrefix("http://") {
            wsBase = "ws://" + wsBase.dropFirst("http://".count)
        }

        let encoded = connectionToken.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? connectionToken
        return URL(string: "\(wsBase)/hubs/realm?id=\(encoded)")
    }

    private func sendHandshake() async throws {
        let handshake = HandshakeRequest(protocol: "json", version: 1)
        let data = try encoder.encode(handshake)
        var text = String(data: data, encoding: .utf8) ?? ""
        text += SignalRClient.recordSeparatorString

        guard let task = webSocketTask else { throw SignalRError.notConnected }
        try await task.send(.string(text))

        // Read the handshake response (should be `{}\u{1e}`)
        let response = try await task.receive()
        switch response {
        case .string(let str):
            let trimmed = str.trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: SignalRClient.recordSeparatorString, with: "")
            if !trimmed.isEmpty && trimmed != "{}" {
                // Non-empty non-empty response may carry an error
                if let json = try? JSONSerialization.jsonObject(with: Data(trimmed.utf8)) as? [String: Any],
                   let errMsg = json["error"] as? String {
                    throw SignalRError.handshakeFailed(errMsg)
                }
            }
        case .data:
            break
        @unknown default:
            break
        }
    }

    // MARK: - Read Loop

    private func startReadLoop() {
        readLoopTask?.cancel()
        readLoopTask = Task { [weak self] in
            guard let self else { return }
            await self.readLoop()
        }
    }

    private func readLoop() async {
        guard let task = webSocketTask else { return }

        var buffer = ""

        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    buffer += text
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        buffer += text
                    }
                @unknown default:
                    break
                }

                // Split on record separator and process each complete message
                while let separatorRange = buffer.range(of: SignalRClient.recordSeparatorString) {
                    let segment = String(buffer[buffer.startIndex..<separatorRange.lowerBound])
                    buffer = String(buffer[separatorRange.upperBound...])
                    if !segment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        await processRawMessage(segment)
                    }
                }

            } catch {
                if Task.isCancelled { break }
                // Connection dropped
                await handleConnectionFailure(error)
                break
            }
        }
    }

    private func processRawMessage(_ text: String) async {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let typeRaw = json["type"] as? Int else {
            return
        }

        switch typeRaw {
        case 1: // Invocation — server calling a client method
            await handleInvocation(json: json)
        case 3: // Completion — server responding to a client invocation
            await handleCompletion(json: json)
        case 6: // Ping — respond with nothing (or could send ping back)
            break
        case 7: // Close
            if !intentionalDisconnect {
                let errMsg = json["error"] as? String
                await handleConnectionFailure(SignalRError.serverClosed(errMsg))
            }
        default:
            break
        }
    }

    private func handleInvocation(json: [String: Any]) async {
        guard let target = json["target"] as? String else { return }
        let args = json["arguments"] as? [Any] ?? []

        switch target {
        case "RealmStarted":
            await MainActor.run { realmStarted = true }

        case "ClientEliminated":
            if let eliminatedId = args.first as? String {
                // We only care if it's our own clientId
                if eliminatedId == storedClientId {
                    await MainActor.run { eliminated = true }
                }
            }

        case "RealmEnded":
            await MainActor.run { realmStarted = false }

        case "Error":
            let message = args.first as? String ?? "Unknown server error"
            await MainActor.run { error = message }

        case "YouWereKicked":
            await MainActor.run {
                error = "You were kicked from the realm."
                eliminated = true
            }

        default:
            break
        }
    }

    private func handleCompletion(json: [String: Any]) async {
        guard let invId = json["invocationId"] as? String else { return }

        let continuation = pendingCompletions.removeValue(forKey: invId)

        if let errMsg = json["error"] as? String {
            continuation?.resume(throwing: SignalRError.invocationError(errMsg))
        } else {
            let result: AnyCodable?
            if let raw = json["result"] {
                result = AnyCodable(raw)
            } else {
                result = nil
            }
            continuation?.resume(returning: result)
        }
    }

    // MARK: - Sending

    private func sendMessage<T: Encodable>(_ message: T) async throws {
        guard let task = webSocketTask else { throw SignalRError.notConnected }
        let data = try encoder.encode(message)
        var text = String(data: data, encoding: .utf8) ?? ""
        text += SignalRClient.recordSeparatorString
        try await task.send(.string(text))
    }

    private func sendWithCompletion(
        message: InvocationMessage,
        invocationId: String,
        timeout: TimeInterval
    ) async throws -> AnyCodable? {
        return try await withThrowingTaskGroup(of: AnyCodable?.self) { group in
            group.addTask { [weak self] in
                guard let self else { throw SignalRError.notConnected }
                return try await withCheckedThrowingContinuation { continuation in
                    self.pendingCompletions[invocationId] = continuation
                    Task {
                        do {
                            try await self.sendMessage(message)
                        } catch {
                            let removed = self.pendingCompletions.removeValue(forKey: invocationId)
                            removed?.resume(throwing: error)
                        }
                    }
                }
            }

            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw SignalRError.timeout
            }

            // First result wins; cancel the other
            defer { group.cancelAll() }
            if let result = try await group.next() {
                return result
            }
            return nil
        }
    }

    // MARK: - Ping

    private func startPing() {
        pingTask?.cancel()
        pingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
                guard !Task.isCancelled, let self else { break }
                let ping = PingMessage()
                try? await self.sendMessage(ping)
            }
        }
    }

    // MARK: - Reconnect

    private func handleConnectionFailure(_ error: Error) async {
        await cleanupTasks()

        if intentionalDisconnect { return }

        if reconnectAttempt >= maxReconnectAttempts {
            await MainActor.run {
                connectionState = .disconnected
                self.error = "Connection lost: \(error.localizedDescription)"
            }
            return
        }

        await MainActor.run { connectionState = .reconnecting }

        let delay = reconnectDelays[min(reconnectAttempt, reconnectDelays.count - 1)]
        reconnectAttempt += 1

        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

        guard !intentionalDisconnect, let serverUrl = currentServerUrl else { return }

        do {
            try await performConnect(serverUrl: serverUrl)
            // Re-join if we have stored join info
            if let joinCode = storedJoinCode, let clientId = storedClientId {
                try? await joinRealm(joinCode: joinCode, clientId: clientId, profile: storedProfile)
            }
        } catch {
            await handleConnectionFailure(error)
        }
    }

    private func cleanupConnection() async {
        await cleanupTasks()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil

        // Fail any pending completions
        let pending = pendingCompletions
        pendingCompletions.removeAll()
        for (_, continuation) in pending {
            continuation.resume(throwing: SignalRError.notConnected)
        }
    }

    private func cleanupTasks() async {
        pingTask?.cancel()
        pingTask = nil
        readLoopTask?.cancel()
        readLoopTask = nil
    }

    // MARK: - Helpers

    private func nextInvocationId() -> String {
        invocationCounter += 1
        return String(invocationCounter)
    }
}

// MARK: - URLSessionWebSocketDelegate

extension SignalRClient: URLSessionWebSocketDelegate {
    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        // Connection opened — handshake is handled separately in performConnect.
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        if !intentionalDisconnect {
            Task { [weak self] in
                await self?.handleConnectionFailure(SignalRError.serverClosed(nil))
            }
        }
    }
}

// MARK: - Error Types

enum SignalRError: LocalizedError {
    case invalidUrl
    case negotiateFailed(String)
    case handshakeFailed(String)
    case notConnected
    case invocationError(String)
    case serverClosed(String?)
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidUrl: return "Invalid server URL."
        case .negotiateFailed(let msg): return "Negotiate failed: \(msg)"
        case .handshakeFailed(let msg): return "Handshake failed: \(msg)"
        case .notConnected: return "Not connected to server."
        case .invocationError(let msg): return "Server error: \(msg)"
        case .serverClosed(let msg): return msg.map { "Server closed: \($0)" } ?? "Server closed the connection."
        case .timeout: return "Request timed out."
        }
    }
}
