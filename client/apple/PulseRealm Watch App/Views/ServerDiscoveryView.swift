import SwiftUI

/// Lists discovered PulseRealm servers on the LAN and allows manual URL entry.
struct ServerDiscoveryView: View {

    @EnvironmentObject var appState: AppState
    @State private var manualUrl: String = ""

    private var discovery: ServerDiscoveryManager { appState.discovery }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Servers")
                    .font(.headline)
                    .foregroundColor(.cyan)

                // Scan button / indicator
                Button(action: {
                    Task { await discovery.scan() }
                }) {
                    if discovery.isScanning {
                        HStack(spacing: 4) {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .scaleEffect(0.7)
                            Text("Scanning…")
                                .font(.caption)
                        }
                    } else {
                        Label("Scan", systemImage: "antenna.radiowaves.left.and.right")
                            .font(.caption)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(discovery.isScanning)

                // Discovered servers
                if discovery.discoveredServers.isEmpty && !discovery.isScanning {
                    Text("No servers found.\nEnter URL manually.")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    ForEach(discovery.discoveredServers) { server in
                        Button(action: {
                            appState.selectServer(server.httpUrl)
                        }) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(server.name)
                                    .font(.caption)
                                    .foregroundColor(.primary)
                                Text(server.httpUrl)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                    }
                }

                Divider()
                    .padding(.vertical, 4)

                // Manual URL entry
                VStack(alignment: .leading, spacing: 2) {
                    Text("Manual URL")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    TextField("http://192.168.x.x:5062", text: $manualUrl)
                        .font(.caption2)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }

                Button("Connect") {
                    let url = manualUrl.trimmingCharacters(in: .whitespaces)
                    if !url.isEmpty {
                        appState.selectServer(url)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
                .disabled(manualUrl.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 4)
        }
        .onAppear {
            Task { await discovery.scan() }
        }
    }
}
