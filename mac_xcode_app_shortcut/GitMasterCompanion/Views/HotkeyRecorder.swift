import AppKit
import SwiftUI

struct HotkeyRecorder: NSViewRepresentable {
    let binding: HotkeyBinding
    let onChange: (HotkeyBinding) -> Void

    func makeNSView(context: Context) -> HotkeyRecorderView {
        let view = HotkeyRecorderView()
        view.binding = binding
        view.onChange = onChange
        return view
    }

    func updateNSView(_ nsView: HotkeyRecorderView, context: Context) {
        nsView.binding = binding
        nsView.onChange = onChange
        nsView.needsDisplay = true
        nsView.invalidateIntrinsicContentSize()
    }
}

final class HotkeyRecorderView: NSView {
    var binding: HotkeyBinding = .defaultVoice
    var onChange: ((HotkeyBinding) -> Void)?

    private var isRecording = false
    private var pendingModifierKeyCode: UInt16?

    override var acceptsFirstResponder: Bool { true }
    override var intrinsicContentSize: NSSize { NSSize(width: 150, height: 30) }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        setAccessibilityRole(.button)
        setAccessibilityLabel("Record keyboard shortcut")
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        isRecording = true
        pendingModifierKeyCode = nil
        needsDisplay = true
    }

    override func resignFirstResponder() -> Bool {
        isRecording = false
        pendingModifierKeyCode = nil
        needsDisplay = true
        return super.resignFirstResponder()
    }

    override func keyDown(with event: NSEvent) {
        guard isRecording else {
            super.keyDown(with: event)
            return
        }
        if event.keyCode == 53 {
            finishRecording()
            return
        }

        let modifiers = HotkeyModifiers(appKitFlags: event.modifierFlags)
        capture(HotkeyBinding(keyCode: event.keyCode, modifiers: modifiers))
    }

    override func flagsChanged(with event: NSEvent) {
        guard isRecording else {
            super.flagsChanged(with: event)
            return
        }
        guard let modifier = HotkeyBinding.modifier(for: event.keyCode) else { return }
        let currentModifiers = HotkeyModifiers(appKitFlags: event.modifierFlags)
        if currentModifiers.contains(modifier.modifier) {
            pendingModifierKeyCode = event.keyCode
        } else if pendingModifierKeyCode == event.keyCode {
            capture(HotkeyBinding(keyCode: event.keyCode, modifiers: modifier.modifier))
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        let bounds = self.bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7)
        let isActive = isRecording || window?.firstResponder === self
        (isActive ? NSColor.controlAccentColor.withAlphaComponent(0.13) : NSColor.controlBackgroundColor).setFill()
        path.fill()
        (isActive ? NSColor.controlAccentColor : NSColor.separatorColor).setStroke()
        path.lineWidth = isActive ? 1.5 : 1
        path.stroke()

        let text = isRecording ? "Press shortcut…" : binding.displayName
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: isRecording ? .medium : .regular),
            .foregroundColor: isRecording ? NSColor.controlAccentColor : NSColor.labelColor,
        ]
        let size = text.size(withAttributes: attributes)
        let point = NSPoint(x: (self.bounds.width - size.width) / 2, y: (self.bounds.height - size.height) / 2)
        text.draw(at: point, withAttributes: attributes)
    }

    private func capture(_ newBinding: HotkeyBinding) {
        onChange?(newBinding)
        finishRecording()
    }

    private func finishRecording() {
        isRecording = false
        pendingModifierKeyCode = nil
        window?.makeFirstResponder(nil)
        needsDisplay = true
    }
}
