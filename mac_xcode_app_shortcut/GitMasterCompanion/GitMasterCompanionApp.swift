import AppKit
import SwiftUI

@main
struct GitMasterCompanionApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        WindowGroup("Git Master", id: "main") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 920, minHeight: 640)
                .background(WindowReader { window in
                    model.registerMainWindow(window)
                })
                .onAppear {
                    model.start()
                }
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .appInfo) {
                Button("Reload Git Master") {
                    model.reloadWebsite()
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }

        MenuBarExtra {
            CompanionMenu()
                .environmentObject(model)
        } label: {
            CompanionStatusBarLabel(model: model)
        }
        .menuBarExtraStyle(.menu)

        Settings {
            SettingsView()
                .environmentObject(model)
        }
    }
}

private struct CompanionStatusBarLabel: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: presentation.microphoneSymbol)
            Image(systemName: presentation.newIssueSymbol)
        }
        .accessibilityLabel(presentation.accessibilityLabel)
    }

    private var presentation: CompanionStatusPresentation {
        CompanionStatusPresentation(
            isGlobalShortcutAvailable: model.hotkeyMonitor.isAvailable
                && model.hotkeyMonitor.hasAccessibilityPermission,
            isVoicePressed: model.isVoicePressed,
            isCreatingIssue: model.isCreatingIssue
        )
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        AppModel.shared.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        AppModel.shared.showMainWindow()
        return true
    }
}

private struct CompanionMenu: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Button {
            model.showMainWindow()
        } label: {
            Label("Open Git Master", systemImage: "macwindow")
        }

        Button {
            model.createNewIssue()
        } label: {
            Label(
                "New issue  \(model.settings.newIssueHotkey.displayName)",
                systemImage: model.isCreatingIssue ? "plus.square.fill" : "plus.square"
            )
        }

        Divider()

        Label(
            model.isVoicePressed ? "Voice input is active" : "Voice: \(model.settings.voiceHotkey.displayName)",
            systemImage: model.isVoicePressed ? "mic.fill" : "mic"
        )

        Label(
            model.isCreatingIssue ? "Opening a new issue…" : "New issue: \(model.settings.newIssueHotkey.displayName)",
            systemImage: model.isCreatingIssue ? "plus.square.fill" : "plus.square"
        )

        Label(
            model.hotkeyMonitor.hasAccessibilityPermission
                ? (model.hotkeyMonitor.isAvailable
                    ? "Global shortcuts active"
                    : "Global shortcut listener stopped")
                : "Accessibility required for reliable global shortcuts",
            systemImage: model.hotkeyMonitor.isAvailable && model.hotkeyMonitor.hasAccessibilityPermission
                ? "checkmark.shield"
                : "exclamationmark.shield"
        )

        Label(
            model.hotkeyMonitor.hasPermission ? "Input Monitoring granted" : "Input Monitoring missing",
            systemImage: model.hotkeyMonitor.hasPermission ? "checkmark.circle" : "xmark.circle"
        )

        Label(
            model.hotkeyMonitor.hasAccessibilityPermission ? "Accessibility granted" : "Accessibility missing",
            systemImage: model.hotkeyMonitor.hasAccessibilityPermission ? "checkmark.circle" : "xmark.circle"
        )

        Label(
            model.hotkeyMonitor.lastKeyboardEventDescription.map { "Last event: \($0)" }
                ?? "No keyboard event received yet",
            systemImage: "keyboard"
        )

        Label(
            model.hotkeyMonitor.lastActionSource.map { "Last shortcut: \($0)" } ?? "No shortcut received yet",
            systemImage: "waveform.path.ecg"
        )

        Divider()

        Button("Settings…") {
            model.showSettingsWindow()
        }

        Button("Reload Git Master") {
            model.reloadWebsite()
        }

        Divider()

        Button("Quit Git Master") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}
