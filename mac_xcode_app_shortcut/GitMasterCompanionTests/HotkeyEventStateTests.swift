import XCTest
@testable import GitMasterCompanion

final class HotkeyEventStateTests: XCTestCase {
    private let voice = HotkeyBinding.defaultVoice
    private let newIssue = HotkeyBinding.defaultNewIssue

    func testModifierVoicePressAndRelease() {
        var state = HotkeyEventState()

        XCTAssertEqual(
            state.process(.modifier(61, modifiers: [.option], isDown: true), voice: voice, newIssue: newIssue),
            [.voicePressed]
        )
        XCTAssertEqual(
            state.process(.modifier(61, modifiers: [], isDown: false), voice: voice, newIssue: newIssue),
            [.voiceReleased]
        )
    }

    func testAnotherKeyCancelsModifierVoiceWithoutSwallowingNewIssue() {
        let optionN = HotkeyBinding(keyCode: 45, modifiers: [.option])
        var state = HotkeyEventState()
        _ = state.process(.modifier(61, modifiers: [.option], isDown: true), voice: voice, newIssue: optionN)

        XCTAssertEqual(
            state.process(.key(45, modifiers: [.option], isDown: true), voice: voice, newIssue: optionN),
            [.voiceCancelled, .newIssue]
        )
        XCTAssertEqual(
            state.process(.modifier(61, modifiers: [], isDown: false), voice: voice, newIssue: optionN),
            []
        )
    }

    func testPointerInputCancelsVoice() {
        var state = HotkeyEventState()
        _ = state.process(.modifier(61, modifiers: [.option], isDown: true), voice: voice, newIssue: newIssue)

        XCTAssertEqual(
            state.process(.pointerDown, voice: voice, newIssue: newIssue),
            [.voiceCancelled]
        )
        XCTAssertEqual(
            state.process(.pointerDown, voice: voice, newIssue: newIssue),
            []
        )
    }

    func testNewIssueIgnoresRepeatUntilKeyUp() {
        var state = HotkeyEventState()

        XCTAssertEqual(
            state.process(.key(45, modifiers: [.command, .shift], isDown: true), voice: voice, newIssue: newIssue),
            [.newIssue]
        )
        XCTAssertEqual(
            state.process(.key(45, modifiers: [.command, .shift], isDown: true, isRepeat: true), voice: voice, newIssue: newIssue),
            []
        )
        XCTAssertEqual(
            state.process(.key(45, modifiers: [], isDown: false), voice: voice, newIssue: newIssue),
            []
        )
        XCTAssertEqual(
            state.process(.key(45, modifiers: [.command, .shift], isDown: true), voice: voice, newIssue: newIssue),
            [.newIssue]
        )
    }

    func testRegularVoiceShortcutSupportsPushToTalk() {
        let commandV = HotkeyBinding(keyCode: 9, modifiers: [.command, .shift])
        var state = HotkeyEventState()

        XCTAssertEqual(
            state.process(.key(9, modifiers: [.command, .shift], isDown: true), voice: commandV, newIssue: newIssue),
            [.voicePressed]
        )
        XCTAssertEqual(
            state.process(.key(9, modifiers: [], isDown: false), voice: commandV, newIssue: newIssue),
            [.voiceReleased]
        )
    }

    func testModifierOnlyNewIssueShortcutRunsOncePerPress() {
        let commandV = HotkeyBinding(keyCode: 9, modifiers: [.command])
        let leftControl = HotkeyBinding(keyCode: 59, modifiers: [.control])
        var state = HotkeyEventState()

        XCTAssertEqual(
            state.process(.modifier(59, modifiers: [.control], isDown: true), voice: commandV, newIssue: leftControl),
            [.newIssue]
        )
        XCTAssertEqual(
            state.process(.modifier(59, modifiers: [.control], isDown: true), voice: commandV, newIssue: leftControl),
            []
        )
        _ = state.process(.modifier(59, modifiers: [], isDown: false), voice: commandV, newIssue: leftControl)
        XCTAssertEqual(
            state.process(.modifier(59, modifiers: [.control], isDown: true), voice: commandV, newIssue: leftControl),
            [.newIssue]
        )
    }

    func testDuplicateMonitorEventsDoNotFireActionsTwice() {
        var state = HotkeyEventState()
        let voiceDown = HotkeyInput.modifier(61, modifiers: [.option], isDown: true)
        let voiceUp = HotkeyInput.modifier(61, modifiers: [], isDown: false)
        let issueDown = HotkeyInput.key(45, modifiers: [.command, .shift], isDown: true)
        let issueUp = HotkeyInput.key(45, modifiers: [], isDown: false)

        XCTAssertEqual(state.process(voiceDown, voice: voice, newIssue: newIssue), [.voicePressed])
        XCTAssertEqual(state.process(voiceDown, voice: voice, newIssue: newIssue), [])
        XCTAssertEqual(state.process(voiceUp, voice: voice, newIssue: newIssue), [.voiceReleased])
        XCTAssertEqual(state.process(voiceUp, voice: voice, newIssue: newIssue), [])

        XCTAssertEqual(state.process(issueDown, voice: voice, newIssue: newIssue), [.newIssue])
        XCTAssertEqual(state.process(issueDown, voice: voice, newIssue: newIssue), [])
        XCTAssertEqual(state.process(issueUp, voice: voice, newIssue: newIssue), [])
        XCTAssertEqual(state.process(issueUp, voice: voice, newIssue: newIssue), [])
    }
}

final class CompanionStatusPresentationTests: XCTestCase {
    func testReadyStatusUsesOutlineIcons() {
        let status = CompanionStatusPresentation(
            isGlobalShortcutAvailable: true,
            isVoicePressed: false,
            isCreatingIssue: false
        )

        XCTAssertEqual(status.microphoneSymbol, "mic")
        XCTAssertEqual(status.newIssueSymbol, "plus.square")
        XCTAssertEqual(status.accessibilityLabel, "Git Master global shortcuts ready")
    }

    func testVoiceStatusUsesFilledMicrophone() {
        let status = CompanionStatusPresentation(
            isGlobalShortcutAvailable: true,
            isVoicePressed: true,
            isCreatingIssue: false
        )

        XCTAssertEqual(status.microphoneSymbol, "mic.fill")
        XCTAssertEqual(status.accessibilityLabel, "Git Master is listening")
    }

    func testNewIssueAndUnavailableStatesHaveDistinctIcons() {
        let issueStatus = CompanionStatusPresentation(
            isGlobalShortcutAvailable: true,
            isVoicePressed: false,
            isCreatingIssue: true
        )
        let unavailableStatus = CompanionStatusPresentation(
            isGlobalShortcutAvailable: false,
            isVoicePressed: false,
            isCreatingIssue: false
        )

        XCTAssertEqual(issueStatus.newIssueSymbol, "plus.square.fill")
        XCTAssertEqual(unavailableStatus.microphoneSymbol, "mic.slash")
    }
}
