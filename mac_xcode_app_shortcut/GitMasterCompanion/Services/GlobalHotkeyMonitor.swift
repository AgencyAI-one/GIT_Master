import AppKit
import ApplicationServices
import Combine
import CoreGraphics
import Foundation

@MainActor
final class GlobalHotkeyMonitor: ObservableObject {
    @Published private(set) var hasPermission = CGPreflightListenEventAccess()
    @Published private(set) var hasAccessibilityPermission = AXIsProcessTrusted()
    @Published private(set) var isRunning = false
    @Published private(set) var lastKeyboardEventDescription: String?
    @Published private(set) var lastActionSource: String?

    var isAvailable: Bool {
        isRunning && (hasPermission || hasAccessibilityPermission)
    }

    var bindingsProvider: (() -> (voice: HotkeyBinding, newIssue: HotkeyBinding))?
    var onAction: ((GlobalHotkeyAction) -> Void)?

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var globalEventMonitor: Any?
    private var localEventMonitor: Any?
    private var accessibilityRefreshTask: Task<Void, Never>?
    private var state = HotkeyEventState()

    func start(requestPermissionIfNeeded: Bool = false) {
        refreshPermissionFlags()

        if requestPermissionIfNeeded {
            if !hasAccessibilityPermission {
                hasAccessibilityPermission = Self.checkAccessibility(prompt: true)
            } else if !hasPermission {
                hasPermission = CGRequestListenEventAccess() || CGPreflightListenEventAccess()
            }
        }

        installAppKitEventMonitors()
        configurePreferredGlobalMonitor()
        updateRunningState()
        updateAccessibilityPermissionPolling()
    }

    func stop() {
        accessibilityRefreshTask?.cancel()
        accessibilityRefreshTask = nil
        removeEventTap()
        removeAppKitEventMonitors()
        isRunning = false
    }

    func requestPermission() {
        hasPermission = CGRequestListenEventAccess() || CGPreflightListenEventAccess()
        configurePreferredGlobalMonitor()
        updateRunningState()
    }

    func requestAccessibilityPermission() {
        hasAccessibilityPermission = Self.checkAccessibility(prompt: true)
        restartAppKitEventMonitors()
        configurePreferredGlobalMonitor()
        updateRunningState()
        updateAccessibilityPermissionPolling()
    }

    func refreshPermission() {
        let previouslyHadAccessibilityPermission = hasAccessibilityPermission
        refreshPermissionFlags()

        configurePreferredGlobalMonitor()

        if previouslyHadAccessibilityPermission != hasAccessibilityPermission {
            restartAppKitEventMonitors()
        } else {
            installAppKitEventMonitors()
        }
        updateRunningState()
        updateAccessibilityPermissionPolling()
    }

    func ensureRunning() {
        refreshPermissionFlags()
        installAppKitEventMonitors()
        configurePreferredGlobalMonitor()
        updateRunningState()
        updateAccessibilityPermissionPolling()
    }

    func restartAfterWake() {
        stop()
        start()
    }

    func resetState() {
        let actions = state.reset()
        actions.forEach { onAction?($0) }
    }

    private func installEventTapIfPermitted() {
        guard hasPermission, eventTap == nil else { return }

        let eventTypes: [CGEventType] = [
            .keyDown, .keyUp, .flagsChanged,
            .leftMouseDown, .rightMouseDown, .otherMouseDown,
        ]
        let mask = eventTypes.reduce(CGEventMask(0)) { result, type in
            result | (CGEventMask(1) << type.rawValue)
        }

        let callback: CGEventTapCallBack = { proxy, type, event, userInfo in
            guard let userInfo else { return Unmanaged.passUnretained(event) }
            let monitor = Unmanaged<GlobalHotkeyMonitor>.fromOpaque(userInfo).takeUnretainedValue()
            return monitor.receive(proxy: proxy, type: type, event: event)
        }

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: mask,
            callback: callback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            hasPermission = CGPreflightListenEventAccess()
            return
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        eventTap = tap
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func removeEventTap() {
        if let runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
        }
        if let eventTap {
            CGEvent.tapEnable(tap: eventTap, enable: false)
        }
        runLoopSource = nil
        eventTap = nil
    }

    nonisolated private func receive(
        proxy: CGEventTapProxy,
        type: CGEventType,
        event: CGEvent
    ) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            Task { @MainActor [weak self] in
                guard let self, let tap = self.eventTap else { return }
                CGEvent.tapEnable(tap: tap, enable: true)
                self.updateRunningState()
            }
            return Unmanaged.passUnretained(event)
        }

        if let input = Self.makeInput(type: type, event: event) {
            Task { @MainActor [weak self] in
                self?.process(input, source: .inputMonitoring)
            }
        }
        return Unmanaged.passUnretained(event)
    }

    nonisolated private static func makeInput(type: CGEventType, event: CGEvent) -> HotkeyInput? {
        let modifiers = HotkeyModifiers(eventFlags: event.flags)
        switch type {
        case .keyDown, .keyUp:
            let keyCode = UInt16(event.getIntegerValueField(.keyboardEventKeycode))
            let isRepeat = event.getIntegerValueField(.keyboardEventAutorepeat) != 0
            return .key(keyCode, modifiers: modifiers, isDown: type == .keyDown, isRepeat: isRepeat)
        case .flagsChanged:
            let keyCode = UInt16(event.getIntegerValueField(.keyboardEventKeycode))
            let isDown = Self.modifierIsDown(keyCode: keyCode, modifiers: modifiers)
                ?? CGEventSource.keyState(.combinedSessionState, key: CGKeyCode(keyCode))
            return .modifier(keyCode, modifiers: modifiers, isDown: isDown)
        case .leftMouseDown, .rightMouseDown, .otherMouseDown:
            return .pointerDown
        default:
            return nil
        }
    }

    private func process(_ input: HotkeyInput, source: InputSource) {
        guard shouldProcessEvents(from: source) else { return }
        if input.kind != .pointer {
            let keyCode = input.keyCode.map { String($0) } ?? "unknown"
            let phase = input.isDown ? "down" : "up"
            let modifiers = input.modifiers.displayPrefix.isEmpty
                ? "no modifiers"
                : input.modifiers.displayPrefix
            lastKeyboardEventDescription = "\(source.displayName) · key \(keyCode) · \(phase) · \(modifiers)"
        }
        guard let bindings = bindingsProvider?() else { return }
        let actions = state.process(input, voice: bindings.voice, newIssue: bindings.newIssue)
        if !actions.isEmpty {
            lastActionSource = source.displayName
        }
        actions.forEach { onAction?($0) }
    }

    private func shouldProcessEvents(from source: InputSource) -> Bool {
        switch source {
        case .accessibility:
            return hasAccessibilityPermission
        case .inputMonitoring:
            return !hasAccessibilityPermission
        case .localWindow:
            let eventTapIsRunning = eventTap.map { CGEvent.tapIsEnabled(tap: $0) } ?? false
            return hasAccessibilityPermission || !eventTapIsRunning
        }
    }

    private func installAppKitEventMonitors() {
        let mask: NSEvent.EventTypeMask = [
            .keyDown, .keyUp, .flagsChanged,
            .leftMouseDown, .rightMouseDown, .otherMouseDown,
        ]

        if globalEventMonitor == nil {
            globalEventMonitor = NSEvent.addGlobalMonitorForEvents(matching: mask) { [weak self] event in
                guard let input = Self.makeInput(event: event) else { return }
                Task { @MainActor [weak self] in
                    self?.process(input, source: .accessibility)
                }
            }
        }

        if localEventMonitor == nil {
            localEventMonitor = NSEvent.addLocalMonitorForEvents(matching: mask) { [weak self] event in
                guard let input = Self.makeInput(event: event) else { return event }
                Task { @MainActor [weak self] in
                    self?.process(input, source: .localWindow)
                }
                return event
            }
        }
    }

    private func restartAppKitEventMonitors() {
        removeAppKitEventMonitors()
        installAppKitEventMonitors()
    }

    private func removeAppKitEventMonitors() {
        if let globalEventMonitor {
            NSEvent.removeMonitor(globalEventMonitor)
        }
        if let localEventMonitor {
            NSEvent.removeMonitor(localEventMonitor)
        }
        globalEventMonitor = nil
        localEventMonitor = nil
    }

    nonisolated private static func makeInput(event: NSEvent) -> HotkeyInput? {
        let modifiers = HotkeyModifiers(appKitFlags: event.modifierFlags)
        switch event.type {
        case .keyDown, .keyUp:
            return .key(
                event.keyCode,
                modifiers: modifiers,
                isDown: event.type == .keyDown,
                isRepeat: event.isARepeat
            )
        case .flagsChanged:
            // Global AppKit monitor callbacks are asynchronous. Reading the current
            // keyboard state here can report "up" for a quick press that has already
            // ended. modifierFlags describes the state at the time of this event.
            let isDown = Self.modifierIsDown(keyCode: event.keyCode, modifiers: modifiers)
                ?? CGEventSource.keyState(.combinedSessionState, key: CGKeyCode(event.keyCode))
            return .modifier(event.keyCode, modifiers: modifiers, isDown: isDown)
        case .leftMouseDown, .rightMouseDown, .otherMouseDown:
            return .pointerDown
        default:
            return nil
        }
    }

    nonisolated private static func modifierIsDown(
        keyCode: UInt16,
        modifiers: HotkeyModifiers
    ) -> Bool? {
        guard let modifier = HotkeyBinding.modifier(for: keyCode)?.modifier else { return nil }
        return modifiers.contains(modifier)
    }

    private func refreshPermissionFlags() {
        hasPermission = CGPreflightListenEventAccess()
        hasAccessibilityPermission = AXIsProcessTrusted()
    }

    private func configurePreferredGlobalMonitor() {
        if hasAccessibilityPermission {
            // The AppKit global monitor is the primary path. Keeping the event tap
            // active at the same time can deliver the same physical key twice.
            removeEventTap()
        } else if hasPermission {
            installEventTapIfPermitted()
            if let eventTap, !CGEvent.tapIsEnabled(tap: eventTap) {
                CGEvent.tapEnable(tap: eventTap, enable: true)
            }
        } else {
            removeEventTap()
        }
    }

    private func updateAccessibilityPermissionPolling() {
        if hasAccessibilityPermission {
            accessibilityRefreshTask?.cancel()
            accessibilityRefreshTask = nil
            return
        }

        guard accessibilityRefreshTask == nil else { return }
        accessibilityRefreshTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled, let self else { return }
                guard AXIsProcessTrusted() else { continue }

                self.hasAccessibilityPermission = true
                self.restartAppKitEventMonitors()
                self.configurePreferredGlobalMonitor()
                self.updateRunningState()
                self.accessibilityRefreshTask = nil
                return
            }
        }
    }

    private func updateRunningState() {
        let eventTapIsRunning = eventTap.map { CGEvent.tapIsEnabled(tap: $0) } ?? false
        let accessibilityMonitorIsRunning = hasAccessibilityPermission && globalEventMonitor != nil
        isRunning = eventTapIsRunning || accessibilityMonitorIsRunning
    }

    nonisolated private static func checkAccessibility(prompt: Bool) -> Bool {
        guard prompt else { return AXIsProcessTrusted() }
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options = [promptKey: true] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    private enum InputSource {
        case inputMonitoring
        case accessibility
        case localWindow

        var displayName: String {
            switch self {
            case .inputMonitoring: return "Input Monitoring"
            case .accessibility: return "Accessibility"
            case .localWindow: return "local window"
            }
        }
    }
}
