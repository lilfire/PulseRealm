import SwiftUI

/// Active workout streaming view showing live heart rate, steps, and connection status.
struct RealmView: View {

    let realmId: String

    @EnvironmentObject var appState: AppState
    @State private var showRealmEnded: Bool = false

    private var connectionDotColor: Color {
        switch appState.signalR.connectionState {
        case .connected:   return .green
        case .reconnecting: return .yellow
        case .connecting:  return .yellow
        case .disconnected: return .red
        }
    }

    var body: some View {
        ZStack {
            // Main content
            VStack(spacing: 10) {
                // Connection state indicator
                HStack {
                    Spacer()
                    Circle()
                        .fill(connectionDotColor)
                        .frame(width: 8, height: 8)
                        .animation(.easeInOut(duration: 0.4), value: connectionDotColor)
                }
                .padding(.trailing, 4)

                // Heart rate
                VStack(spacing: 0) {
                    Text("\(appState.healthKit.heartRate)")
                        .font(.system(size: 46, weight: .bold, design: .rounded))
                        .foregroundColor(.red)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("BPM")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                // Steps
                VStack(spacing: 0) {
                    Text("\(appState.healthKit.steps)")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundColor(.cyan)
                    Text("Steps")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Spacer(minLength: 0)

                // Leave button
                Button("Leave") {
                    Task { await appState.leaveRealm() }
                }
                .buttonStyle(.bordered)
                .foregroundColor(.red)
                .font(.caption)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)

            // Realm Ended overlay
            if showRealmEnded {
                realmEndedOverlay
            }
        }
        .onChange(of: appState.signalR.realmStarted) { _, newValue in
            // realmStarted transitions false after RealmEnded is received
            if !newValue && !showRealmEnded {
                showRealmEnded = true
            }
        }
        .onChange(of: appState.signalR.eliminated) { _, isEliminated in
            if isEliminated {
                Task { await appState.leaveRealm() }
            }
        }
    }

    private var realmEndedOverlay: some View {
        ZStack {
            Color.black.opacity(0.85)
                .ignoresSafeArea()

            VStack(spacing: 8) {
                Text("Realm Ended")
                    .font(.headline)
                    .foregroundColor(.cyan)

                Text("Steps: \(appState.healthKit.steps)")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Button("Done") {
                    showRealmEnded = false
                    Task { await appState.leaveRealm() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
            }
            .padding()
        }
    }
}
