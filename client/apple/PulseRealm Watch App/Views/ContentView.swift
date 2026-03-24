import SwiftUI

/// Root view that routes to the correct screen based on `AppState.screen`.
struct ContentView: View {

    @EnvironmentObject var appState: AppState

    var body: some View {
        switch appState.screen {
        case .profileSetup:
            ProfileSetupView()

        case .serverDiscovery:
            ServerDiscoveryView()

        case .joinRealm(let serverUrl):
            JoinView(serverUrl: serverUrl)

        case .inRealm(let realmId, _):
            RealmView(realmId: realmId)
        }
    }
}
