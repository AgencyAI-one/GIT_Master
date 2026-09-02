import AppKit
import Combine
import Foundation

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    let settings: AppSettings
    let hotkeyMonitor: GlobalHotkeyMonitor
    let webBridge: WebBridge
    let launchAtLogin: LaunchAtLoginController

    @Published private(set) var isVoicePressed = false
    @Published private(set) var isCreatingIssue = false
    @Published var alertMessage: String?

    private weak var mainWindow: NSWindow?
    private var mainWindowOpener: (() -> Void)?
    private var started = false
    private var newIssueIndicatorTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    private init() {
        settings = AppSettings()
        hotkeyMonitor = GlobalHotkeyMonitor()
        webBridge = WebBridge()
        launchAtLogin = LaunchAtLoginController()

        [
            settings.objectWillChange.eraseToAnyPublisher(),
            hotkeyMonitor.objectWillChange.eraseToAnyPublisher(),
            webBridge.objectWillChange.eraseToAnyPublisher(),
            launchAtLogin.objectWillChange.eraseToAnyPublisher(),
        ].forEach { publisher in
            publisher
                .receive(on: RunLoop.main)
                .sink { [weak self] _ in self?.objectWillChange.send() }
                .store(in: &cancellables)
        }

        NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.hotkeyMonitor.refreshPermission() }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.hotkeyMonitor.ensureRunning() }
            .store(in: &cancellables)

        NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.didWakeNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.hotkeyMonitor.restartAfterWake() }
            .store(in: &cancellables)
    }

    func start() {
        guard !started else { return }
        started = true

        hotkeyMonitor.bindingsProvider = { [weak settings] in
            guard let settings else { return (.defaultVoice, .defaultNewIssue) }
            return (settings.voiceHotkey, settings.newIssueHotkey)
        }
        hotkeyMonitor.onAction = { [weak self] action in
            Task { @MainActor in
                self?.handle(action)
            }
        }
        hotkeyMonitor.start(requestPermissionIfNeeded: true)
    }

    func registerMainWindow(_ window: NSWindow?) {
        guard let window else { return }
        mainWindow = window
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.title = "Git Master"
    }

    func registerMainWindowOpener(_ opener: @escaping () -> Void) {
        mainWindowOpener = opener
    }

    func showMainWindow() {
        guard let window = mainWindow ?? NSApplication.shared.windows.first(where: { $0.title == "Git Master" }) else {
            mainWindowOpener?()
            NSApplication.shared.activate(ignoringOtherApps: true)
            return
        }
        if window.isMiniaturized {
            window.deminiaturize(nil)
        }
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func showSettingsWindow() {
        NSApplication.shared.activate(ignoringOtherApps: true)
        let modernSelector = Selector(("showSettingsWindow:"))
        if !NSApplication.shared.sendAction(modernSelector, to: nil, from: nil) {
            NSApplication.shared.sendAction(Selector(("showPreferencesWindow:")), to: nil, from: nil)
        }
    }

    func reloadWebsite() {
        webBridge.reload()
    }

    func createNewIssue() {
        showNewIssueIndicator()
        showMainWindow()
        webBridge.dispatchNewIssue()
    }

    func requestInputMonitoringPermission() {
        hotkeyMonitor.requestPermission()
    }

    func requestAccessibilityPermission() {
        hotkeyMonitor.requestAccessibilityPermission()
    }

    func openInputMonitoringSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") else { return }
        NSWorkspace.shared.open(url)
    }

    func openAccessibilitySettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") else { return }
        NSWorkspace.shared.open(url)
    }

    func updateServerURL(_ rawValue: String) -> Bool {
        switch settings.setServerURL(rawValue) {
        case .success:
            return true
        case .failure(let error):
            alertMessage = error.localizedDescription
            return false
        }
    }

    func updateVoiceHotkey(_ binding: HotkeyBinding) {
        guard binding != settings.newIssueHotkey else {
            alertMessage = "Voice and New Issue must use different shortcuts."
            return
        }
        cancelVoiceInput()
        settings.voiceHotkey = binding
    }

    func updateNewIssueHotkey(_ binding: HotkeyBinding) {
        guard binding != settings.voiceHotkey else {
            alertMessage = "Voice and New Issue must use different shortcuts."
            return
        }
        settings.newIssueHotkey = binding
    }

    func resetHotkeys() {
        cancelVoiceInput()
        settings.voiceHotkey = .defaultVoice
        settings.newIssueHotkey = .defaultNewIssue
    }

    private func handle(_ action: GlobalHotkeyAction) {
        switch action {
        case .voicePressed:
            isVoicePressed = true
            webBridge.dispatchVoicePressed()
        case .voiceReleased:
            isVoicePressed = false
            webBridge.dispatchVoiceReleased()
        case .voiceCancelled:
            isVoicePressed = false
            webBridge.dispatchVoiceCancelled()
        case .newIssue:
            createNewIssue()
        }
    }

    private func cancelVoiceInput() {
        hotkeyMonitor.resetState()
        if isVoicePressed {
            isVoicePressed = false
            webBridge.dispatchVoiceCancelled()
        }
    }

    private func showNewIssueIndicator() {
        newIssueIndicatorTask?.cancel()
        isCreatingIssue = true
        newIssueIndicatorTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            guard !Task.isCancelled else { return }
            self?.isCreatingIssue = false
        }
    }
}

enum ServerURLValidationError: LocalizedError {
    case empty
    case invalid
    case unsupportedScheme
    case insecureRemoteURL

    var errorDescription: String? {
        switch self {
        case .empty:
            return "Enter the Git Master server URL."
        case .invalid:
            return "Enter a complete URL, for example https://git-master.example.com."
        case .unsupportedScheme:
            return "The server URL must use http or https."
        case .insecureRemoteURL:
            return "Remote Git Master servers must use HTTPS. HTTP is allowed only for localhost development."
        }
    }
}

struct CompanionStatusPresentation: Equatable {
    let microphoneSymbol: String
    let newIssueSymbol: String
    let accessibilityLabel: String

    init(isGlobalShortcutAvailable: Bool, isVoicePressed: Bool, isCreatingIssue: Bool) {
        microphoneSymbol = isVoicePressed
            ? "mic.fill"
            : (isGlobalShortcutAvailable ? "mic" : "mic.slash")
        newIssueSymbol = isCreatingIssue ? "plus.square.fill" : "plus.square"

        if isVoicePressed {
            accessibilityLabel = "Git Master is listening"
        } else if isCreatingIssue {
            accessibilityLabel = "Git Master is creating an issue"
        } else if !isGlobalShortcutAvailable {
            accessibilityLabel = "Git Master global shortcuts unavailable"
        } else {
            accessibilityLabel = "Git Master global shortcuts ready"
        }
    }
}
