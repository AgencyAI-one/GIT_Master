import XCTest
@testable import GitMasterCompanion

final class HotkeyBindingTests: XCTestCase {
    func testDefaultVoiceUsesRightOption() {
        XCTAssertTrue(HotkeyBinding.defaultVoice.isModifierOnly)
        XCTAssertEqual(HotkeyBinding.defaultVoice.displayName, "Right Option")
        XCTAssertEqual(HotkeyBinding.defaultVoice.domCode, "AltRight")
    }

    func testShortcutRequiresExactModifiers() {
        let shortcut = HotkeyBinding(keyCode: 45, modifiers: [.option])
        XCTAssertTrue(shortcut.matches(keyCode: 45, modifiers: [.option]))
        XCTAssertFalse(shortcut.matches(keyCode: 45, modifiers: [.option, .shift]))
        XCTAssertFalse(shortcut.matches(keyCode: 9, modifiers: [.option]))
    }

    func testBindingRoundTripsThroughJSON() throws {
        let original = HotkeyBinding(keyCode: 9, modifiers: [.command, .shift])
        let data = try JSONEncoder().encode(original)
        let restored = try JSONDecoder().decode(HotkeyBinding.self, from: data)
        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored.displayName, "⇧⌘V")
    }

    func testDefaultNewIssueUsesCommandShiftN() {
        XCTAssertEqual(HotkeyBinding.defaultNewIssue.displayName, "⇧⌘N")
        XCTAssertEqual(HotkeyBinding.defaultNewIssue.domCode, "KeyN")
    }
}
