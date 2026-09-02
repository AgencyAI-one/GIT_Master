import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var serverURL = ""
    @State private var showingResetConfirmation = false

    var body: some View {
        Form {
            Section("Git Master server") {
                HStack(spacing: 10) {
                    TextField("https://git-master.example.com", text: $serverURL)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(saveServerURL)
                    Button("Connect", action: saveServerURL)
                        .buttonStyle(.borderedProminent)
                }

                Text("The app loads this Git Master installation. Use HTTPS outside local development.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Global shortcuts") {
                ShortcutSettingRow(
                    title: "Voice input",
                    help: "Right Option is recommended. Hold to talk, or double-press to latch recording.",
                    binding: model.settings.voiceHotkey,
                    onChange: model.updateVoiceHotkey
                )

                ShortcutSettingRow(
                    title: "New issue",
                    help: "Opens Git Master and starts a new issue in the current repository.",
                    binding: model.settings.newIssueHotkey,
                    onChange: model.updateNewIssueHotkey
                )

                HStack {
                    Text("Click a shortcut field, then press the new key or combination.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Reset Shortcuts") {
                        showingResetConfirmation = true
                    }
                }
            }

            Section("macOS permissions") {
                HStack {
                    Label(
                        model.hotkeyMonitor.hasPermission ? "Input Monitoring granted" : "Input Monitoring required",
                        systemImage: model.hotkeyMonitor.hasPermission ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(model.hotkeyMonitor.hasPermission ? Color.green : Color.orange)

                    Spacer()

                    if !model.hotkeyMonitor.hasPermission {
                        Button("Request Permission") { model.requestInputMonitoringPermission() }
                    }
                    Button("Open Settings") { model.openInputMonitoringSettings() }
                }

                HStack {
                    Label(
                        model.hotkeyMonitor.hasAccessibilityPermission ? "Accessibility granted" : "Accessibility required for AppKit global hotkeys",
                        systemImage: model.hotkeyMonitor.hasAccessibilityPermission ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(model.hotkeyMonitor.hasAccessibilityPermission ? Color.green : Color.orange)

                    Spacer()

                    if !model.hotkeyMonitor.hasAccessibilityPermission {
                        Button("Request Permission") { model.requestAccessibilityPermission() }
                    }
                    Button("Open Settings") { model.openAccessibilitySettings() }
                }

                HStack {
                    Label(permissionStatusText, systemImage: permissionStatusIcon)
                        .foregroundStyle(permissionStatusColor)
                    Spacer()
                    Button("Refresh") { model.hotkeyMonitor.refreshPermission() }
                    Button("Restart Listener") { model.hotkeyMonitor.restartAfterWake() }
                }

                Text("Accessibility lets the passive AppKit monitor receive keyboard events sent to other apps. Microphone access is requested separately when voice input starts.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Startup") {
                Toggle(
                    "Launch Git Master at login",
                    isOn: Binding(
                        get: { model.launchAtLogin.isEnabled },
                        set: { model.launchAtLogin.setEnabled($0) }
                    )
                )

                if let error = model.launchAtLogin.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 610, height: 570)
        .onAppear {
            serverURL = model.settings.serverURL.absoluteString
            model.hotkeyMonitor.refreshPermission()
            model.launchAtLogin.refresh()
        }
        .confirmationDialog("Reset both shortcuts?", isPresented: $showingResetConfirmation) {
            Button("Reset", role: .destructive) { model.resetHotkeys() }
            Button("Cancel", role: .cancel) { }
        }
        .alert(
            "Git Master",
            isPresented: Binding(
                get: { model.alertMessage != nil },
                set: { if !$0 { model.alertMessage = nil } }
            ),
            actions: {
                Button("OK", role: .cancel) { model.alertMessage = nil }
            },
            message: {
                Text(model.alertMessage ?? "")
            }
        )
    }

    private func saveServerURL() {
        if model.updateServerURL(serverURL) {
            serverURL = model.settings.serverURL.absoluteString
        }
    }

    private var permissionStatusText: String {
        if !model.hotkeyMonitor.hasAccessibilityPermission {
            return "Accessibility is required for reliable global shortcuts"
        }
        if model.hotkeyMonitor.isAvailable { return "Global shortcuts are active" }
        return "Global shortcut listener is stopped"
    }

    private var permissionStatusIcon: String {
        model.hotkeyMonitor.isAvailable && model.hotkeyMonitor.hasAccessibilityPermission
            ? "checkmark.circle.fill"
            : "exclamationmark.triangle.fill"
    }

    private var permissionStatusColor: Color {
        model.hotkeyMonitor.isAvailable && model.hotkeyMonitor.hasAccessibilityPermission ? .green : .orange
    }
}

private struct ShortcutSettingRow: View {
    let title: String
    let help: String
    let binding: HotkeyBinding
    let onChange: (HotkeyBinding) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .fontWeight(.medium)
                Text(help)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 20)
            HotkeyRecorder(binding: binding, onChange: onChange)
                .frame(width: 150, height: 30)
        }
        .padding(.vertical, 3)
    }
}
