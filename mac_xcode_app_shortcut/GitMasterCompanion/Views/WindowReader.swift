import AppKit
import SwiftUI

struct WindowReader: NSViewRepresentable {
    let onWindowChange: (NSWindow?) -> Void

    init(_ onWindowChange: @escaping (NSWindow?) -> Void) {
        self.onWindowChange = onWindowChange
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async { onWindowChange(view.window) }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async { onWindowChange(nsView.window) }
    }
}
