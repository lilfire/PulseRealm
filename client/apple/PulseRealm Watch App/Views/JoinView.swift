import SwiftUI

/// 6-digit join code entry view with a custom number pad sized for Apple Watch.
struct JoinView: View {

    let serverUrl: String

    @EnvironmentObject var appState: AppState
    @State private var digits: [Int] = []
    @State private var isJoining: Bool = false

    private var joinCode: String {
        digits.map { String($0) }.joined()
    }

    private var displayCode: String {
        let filled = digits.map { String($0) }
        let placeholders = Array(repeating: "-", count: max(0, 6 - filled.count))
        return (filled + placeholders).joined()
    }

    private var canConfirm: Bool {
        digits.count == 6 && !isJoining
    }

    var body: some View {
        VStack(spacing: 6) {
            // Digit display
            Text(displayCode)
                .font(.system(.title3, design: .monospaced))
                .foregroundColor(digits.count == 6 ? .cyan : .secondary)
                .animation(.none, value: displayCode)

            // Error message
            if let error = appState.signalR.error {
                Text(error)
                    .font(.caption2)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .onTapGesture { appState.signalR.clearError() }
            }

            // Loading indicator
            if isJoining {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(0.8)
            } else {
                // Number pad: rows 1–3, then backspace / 0 / confirm
                numberPad
            }

            // Back button
            Button("Back") {
                appState.screen = .serverDiscovery
            }
            .buttonStyle(.bordered)
            .font(.caption2)
        }
        .padding(.horizontal, 4)
    }

    private var numberPad: some View {
        VStack(spacing: 4) {
            // Row 1: 1 2 3
            padRow(keys: [1, 2, 3])
            // Row 2: 4 5 6
            padRow(keys: [4, 5, 6])
            // Row 3: 7 8 9
            padRow(keys: [7, 8, 9])
            // Row 4: backspace, 0, confirm
            HStack(spacing: 4) {
                padButton(label: "⌫", color: .secondary) {
                    if !digits.isEmpty {
                        digits.removeLast()
                    }
                }
                padButton(label: "0", color: .clear) {
                    appendDigit(0)
                }
                .disabled(digits.count >= 6)

                padButton(label: "✓", color: canConfirm ? .cyan : .secondary) {
                    confirmJoin()
                }
                .disabled(!canConfirm)
            }
        }
    }

    private func padRow(keys: [Int]) -> some View {
        HStack(spacing: 4) {
            ForEach(keys, id: \.self) { key in
                padButton(label: "\(key)", color: .clear) {
                    appendDigit(key)
                }
                .disabled(digits.count >= 6)
            }
        }
    }

    private func padButton(
        label: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 16, weight: .medium, design: .monospaced))
                .frame(width: 34, height: 28)
                .background(color.opacity(0.2))
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private func appendDigit(_ digit: Int) {
        guard digits.count < 6 else { return }
        digits.append(digit)
    }

    private func confirmJoin() {
        guard canConfirm else { return }
        isJoining = true
        appState.signalR.clearError()

        Task {
            await appState.join(joinCode: joinCode, serverUrl: serverUrl)
            isJoining = false
        }
    }
}
