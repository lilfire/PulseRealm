import SwiftUI

/// First-run screen for entering the user's display name, height, and weight.
struct ProfileSetupView: View {

    @EnvironmentObject var appState: AppState

    @State private var name: String = ""
    @State private var heightCm: Int = 170
    @State private var weightKg: Int = 70

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Profile")
                    .font(.headline)
                    .foregroundColor(.cyan)

                // Name field
                VStack(alignment: .leading, spacing: 2) {
                    Text("Name")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    TextField("Your name", text: $name)
                        .textInputAutocapitalization(.words)
                }

                // Height picker
                VStack(alignment: .leading, spacing: 2) {
                    Text("Height (cm)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Picker("Height", selection: $heightCm) {
                        ForEach(100...220, id: \.self) { cm in
                            Text("\(cm)").tag(cm)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 80)
                }

                // Weight picker
                VStack(alignment: .leading, spacing: 2) {
                    Text("Weight (kg)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Picker("Weight", selection: $weightKg) {
                        ForEach(30...200, id: \.self) { kg in
                            Text("\(kg)").tag(kg)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 80)
                }

                Button("Save") {
                    let trimmed = name.trimmingCharacters(in: .whitespaces)
                    let p = ClientProfile(
                        clientId: appState.clientId,
                        name: trimmed,
                        heightCm: Double(heightCm),
                        weightKg: Double(weightKg)
                    )
                    appState.saveProfile(p)
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
                .disabled(!canSave)
            }
            .padding(.horizontal, 4)
        }
    }
}
