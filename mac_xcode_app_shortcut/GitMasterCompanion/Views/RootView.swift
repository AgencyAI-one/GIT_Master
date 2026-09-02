import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        ZStack(alignment: .top) {
            GitMasterWebView(
                serverURL: model.settings.serverURL,
                voiceHotkey: model.settings.voiceHotkey,
                newIssueHotkey: model.settings.newIssueHotkey,
                bridge: model.webBridge
            )

            if case .failed(let message) = model.webBridge.loadState {
                ConnectionErrorView(message: message)
                    .padding(.top, 24)
            }

            VStack(spacing: 8) {
                if !model.hotkeyMonitor.isAvailable || !model.hotkeyMonitor.hasAccessibilityPermission {
                    InputMonitoringBanner()
                }
                if model.isVoicePressed {
                    VoiceActivityPill()
                }
            }
            .padding(.top, 14)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            model.registerMainWindowOpener {
                openWindow(id: "main")
            }
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
}

private struct InputMonitoringBanner: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "keyboard.badge.ellipsis")
            Text(
                !model.hotkeyMonitor.hasAccessibilityPermission
                    ? "Enable Accessibility for reliable global shortcuts"
                    : "Global shortcut listener is stopped"
            )
                .font(.system(size: 12, weight: .medium))
            Button(model.hotkeyMonitor.hasAccessibilityPermission ? "Restart" : "Enable") {
                if model.hotkeyMonitor.hasAccessibilityPermission {
                    model.hotkeyMonitor.restartAfterWake()
                } else {
                    model.requestAccessibilityPermission()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            Button("Settings") {
                model.showSettingsWindow()
            }
            .controlSize(.small)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
        .overlay {
            Capsule().stroke(Color(nsColor: .separatorColor).opacity(0.7))
        }
        .shadow(color: .black.opacity(0.14), radius: 12, y: 4)
    }
}

private struct VoiceActivityPill: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform")
            Text("Listening…")
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(Color.black)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.green, in: Capsule())
        .shadow(color: .black.opacity(0.18), radius: 12, y: 4)
    }
}

private struct ConnectionErrorView: View {
    @EnvironmentObject private var model: AppModel
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Cannot open Git Master", systemImage: "wifi.exclamationmark")
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            HStack {
                Button("Try Again") { model.reloadWebsite() }
                Button("Server Settings") { model.showSettingsWindow() }
            }
        }
        .padding(16)
        .frame(maxWidth: 420, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color(nsColor: .separatorColor).opacity(0.7))
        }
        .shadow(color: .black.opacity(0.16), radius: 18, y: 8)
    }
}
