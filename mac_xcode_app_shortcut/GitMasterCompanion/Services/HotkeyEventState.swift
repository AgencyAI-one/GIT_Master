import Foundation

enum GlobalHotkeyAction: Equatable {
    case voicePressed
    case voiceReleased
    case voiceCancelled
    case newIssue
}

enum HotkeyInputKind: Equatable {
    case key
    case modifier
    case pointer
}

struct HotkeyInput: Equatable {
    let kind: HotkeyInputKind
    let keyCode: UInt16?
    let modifiers: HotkeyModifiers
    let isDown: Bool
    let isRepeat: Bool

    static func key(_ keyCode: UInt16, modifiers: HotkeyModifiers, isDown: Bool, isRepeat: Bool = false) -> HotkeyInput {
        HotkeyInput(kind: .key, keyCode: keyCode, modifiers: modifiers, isDown: isDown, isRepeat: isRepeat)
    }

    static func modifier(_ keyCode: UInt16, modifiers: HotkeyModifiers, isDown: Bool) -> HotkeyInput {
        HotkeyInput(kind: .modifier, keyCode: keyCode, modifiers: modifiers, isDown: isDown, isRepeat: false)
    }

    static let pointerDown = HotkeyInput(kind: .pointer, keyCode: nil, modifiers: [], isDown: true, isRepeat: false)
}

struct HotkeyEventState {
    private(set) var voiceKeyIsDown = false
    private var voiceWasCancelled = false
    private var newIssueKeyIsDown = false

    mutating func process(
        _ input: HotkeyInput,
        voice: HotkeyBinding,
        newIssue: HotkeyBinding
    ) -> [GlobalHotkeyAction] {
        var actions: [GlobalHotkeyAction] = []

        if voiceKeyIsDown, !voiceWasCancelled, isDifferentInputPressed(input, voice: voice) {
            voiceWasCancelled = true
            actions.append(.voiceCancelled)
        }

        if inputMatchesBindingKey(input, binding: voice) {
            if input.isDown {
                if !voiceKeyIsDown, !input.isRepeat, input.modifiers == voice.modifiers {
                    voiceKeyIsDown = true
                    voiceWasCancelled = false
                    actions.append(.voicePressed)
                }
            } else if voiceKeyIsDown {
                voiceKeyIsDown = false
                if !voiceWasCancelled {
                    actions.append(.voiceReleased)
                }
                voiceWasCancelled = false
            }
        }

        if inputMatchesBindingKey(input, binding: newIssue) {
            if input.isDown {
                if !newIssueKeyIsDown, !input.isRepeat, input.modifiers == newIssue.modifiers {
                    newIssueKeyIsDown = true
                    actions.append(.newIssue)
                }
            } else {
                newIssueKeyIsDown = false
            }
        }

        return actions
    }

    mutating func reset() -> [GlobalHotkeyAction] {
        let shouldCancelVoice = voiceKeyIsDown && !voiceWasCancelled
        voiceKeyIsDown = false
        voiceWasCancelled = false
        newIssueKeyIsDown = false
        return shouldCancelVoice ? [.voiceCancelled] : []
    }

    private func inputMatchesBindingKey(_ input: HotkeyInput, binding: HotkeyBinding) -> Bool {
        guard let inputKeyCode = input.keyCode, inputKeyCode == binding.keyCode else { return false }
        return binding.isModifierOnly ? input.kind == .modifier : input.kind == .key
    }

    private func isDifferentInputPressed(_ input: HotkeyInput, voice: HotkeyBinding) -> Bool {
        guard input.isDown else { return false }
        if input.kind == .pointer { return true }
        return input.keyCode != voice.keyCode
    }
}
