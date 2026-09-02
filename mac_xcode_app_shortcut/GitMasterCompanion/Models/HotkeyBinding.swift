import AppKit
import CoreGraphics
import Foundation

struct HotkeyModifiers: OptionSet, Codable, Hashable {
    let rawValue: Int

    static let command = HotkeyModifiers(rawValue: 1 << 0)
    static let control = HotkeyModifiers(rawValue: 1 << 1)
    static let option = HotkeyModifiers(rawValue: 1 << 2)
    static let shift = HotkeyModifiers(rawValue: 1 << 3)

    static let supportedMask: HotkeyModifiers = [.command, .control, .option, .shift]

    init(rawValue: Int) {
        self.rawValue = rawValue
    }

    init(eventFlags: CGEventFlags) {
        var value: HotkeyModifiers = []
        if eventFlags.contains(.maskCommand) { value.insert(.command) }
        if eventFlags.contains(.maskControl) { value.insert(.control) }
        if eventFlags.contains(.maskAlternate) { value.insert(.option) }
        if eventFlags.contains(.maskShift) { value.insert(.shift) }
        self = value
    }

    init(appKitFlags: NSEvent.ModifierFlags) {
        var value: HotkeyModifiers = []
        if appKitFlags.contains(.command) { value.insert(.command) }
        if appKitFlags.contains(.control) { value.insert(.control) }
        if appKitFlags.contains(.option) { value.insert(.option) }
        if appKitFlags.contains(.shift) { value.insert(.shift) }
        self = value
    }

    var displayPrefix: String {
        var result = ""
        if contains(.control) { result += "⌃" }
        if contains(.option) { result += "⌥" }
        if contains(.shift) { result += "⇧" }
        if contains(.command) { result += "⌘" }
        return result
    }
}

struct HotkeyBinding: Codable, Equatable, Hashable {
    let keyCode: UInt16
    let modifiers: HotkeyModifiers

    static let defaultVoice = HotkeyBinding(keyCode: 61, modifiers: [.option])
    static let defaultNewIssue = HotkeyBinding(keyCode: 45, modifiers: [.command, .shift])

    var isModifierOnly: Bool {
        Self.modifierKeyCodes[keyCode] != nil
    }

    var displayName: String {
        if let modifier = Self.modifierKeyCodes[keyCode] {
            return modifier.label
        }
        return modifiers.displayPrefix + Self.keyLabels[keyCode, default: "Key \(keyCode)"]
    }

    var domCode: String? {
        Self.domCodes[keyCode]
    }

    func matches(keyCode candidateKeyCode: UInt16, modifiers candidateModifiers: HotkeyModifiers) -> Bool {
        keyCode == candidateKeyCode && modifiers == candidateModifiers.intersection(.supportedMask)
    }

    static func modifier(for keyCode: UInt16) -> (modifier: HotkeyModifiers, label: String)? {
        modifierKeyCodes[keyCode]
    }

    private static let modifierKeyCodes: [UInt16: (modifier: HotkeyModifiers, label: String)] = [
        54: (.command, "Right Command"),
        55: (.command, "Left Command"),
        56: (.shift, "Left Shift"),
        58: (.option, "Left Option"),
        59: (.control, "Left Control"),
        60: (.shift, "Right Shift"),
        61: (.option, "Right Option"),
        62: (.control, "Right Control"),
    ]

    private static let keyLabels: [UInt16: String] = [
        0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
        11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 16: "Y", 17: "T", 18: "1", 19: "2", 20: "3",
        21: "4", 22: "6", 23: "5", 24: "=", 25: "9", 26: "7", 27: "−", 28: "8", 29: "0", 30: "]",
        31: "O", 32: "U", 33: "[", 34: "I", 35: "P", 36: "Return", 37: "L", 38: "J", 39: "'", 40: "K",
        41: ";", 42: "\\", 43: ",", 44: "/", 45: "N", 46: "M", 47: ".", 48: "Tab", 49: "Space",
        50: "`", 51: "Delete", 53: "Esc", 64: "F17", 65: ".", 67: "*", 69: "+", 71: "Clear",
        75: "/", 76: "Enter", 78: "−", 79: "F18", 80: "F19", 81: "=", 82: "0", 83: "1", 84: "2",
        85: "3", 86: "4", 87: "5", 88: "6", 89: "7", 91: "8", 92: "9", 96: "F5", 97: "F6",
        98: "F7", 99: "F3", 100: "F8", 101: "F9", 103: "F11", 105: "F13", 106: "F16", 107: "F14",
        109: "F10", 111: "F12", 113: "F15", 114: "Help", 115: "Home", 116: "Page Up", 117: "Forward Delete",
        118: "F4", 119: "End", 120: "F2", 121: "Page Down", 122: "F1", 123: "←", 124: "→", 125: "↓", 126: "↑",
    ]

    private static let domCodes: [UInt16: String] = [
        0: "KeyA", 1: "KeyS", 2: "KeyD", 3: "KeyF", 4: "KeyH", 5: "KeyG", 6: "KeyZ", 7: "KeyX",
        8: "KeyC", 9: "KeyV", 11: "KeyB", 12: "KeyQ", 13: "KeyW", 14: "KeyE", 15: "KeyR", 16: "KeyY",
        17: "KeyT", 18: "Digit1", 19: "Digit2", 20: "Digit3", 21: "Digit4", 22: "Digit6", 23: "Digit5",
        24: "Equal", 25: "Digit9", 26: "Digit7", 27: "Minus", 28: "Digit8", 29: "Digit0", 30: "BracketRight",
        31: "KeyO", 32: "KeyU", 33: "BracketLeft", 34: "KeyI", 35: "KeyP", 36: "Enter", 37: "KeyL",
        38: "KeyJ", 39: "Quote", 40: "KeyK", 41: "Semicolon", 42: "Backslash", 43: "Comma", 44: "Slash",
        45: "KeyN", 46: "KeyM", 47: "Period", 48: "Tab", 49: "Space", 50: "Backquote", 51: "Backspace",
        53: "Escape", 54: "MetaRight", 55: "MetaLeft", 56: "ShiftLeft", 58: "AltLeft", 59: "ControlLeft",
        60: "ShiftRight", 61: "AltRight", 62: "ControlRight", 64: "F17", 79: "F18", 80: "F19", 96: "F5",
        97: "F6", 98: "F7", 99: "F3", 100: "F8", 101: "F9", 103: "F11", 105: "F13", 106: "F16",
        107: "F14", 109: "F10", 111: "F12", 113: "F15", 114: "Help", 115: "Home", 116: "PageUp",
        117: "Delete", 118: "F4", 119: "End", 120: "F2", 121: "PageDown", 122: "F1", 123: "ArrowLeft",
        124: "ArrowRight", 125: "ArrowDown", 126: "ArrowUp",
    ]
}
