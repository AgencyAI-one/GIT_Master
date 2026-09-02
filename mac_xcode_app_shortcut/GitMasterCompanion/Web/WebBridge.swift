import Combine
import Foundation
import WebKit

@MainActor
final class WebBridge: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case ready
        case failed(String)
    }

    @Published private(set) var loadState: LoadState = .idle
    private weak var webView: WKWebView?
    private var pendingScripts: [String] = []

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func setLoadState(_ state: LoadState) {
        loadState = state
        if state == .ready {
            flushPendingScripts()
        }
    }

    func load(_ url: URL) {
        setLoadState(.loading)
        webView?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    func reload() {
        webView?.reload()
    }

    func dispatchVoicePressed() {
        dispatchEventIfReady(named: "git-master:voice-pressed")
    }

    func dispatchVoiceReleased() {
        dispatchEventIfReady(named: "git-master:voice-released")
    }

    func dispatchVoiceCancelled() {
        dispatchEventIfReady(named: "git-master:voice-cancelled")
    }

    func dispatchNewIssue() {
        let script = """
        (() => {
          window.dispatchEvent(new CustomEvent('git-master:new-issue', { detail: { at: Date.now(), source: 'macos' } }));
          const button = document.querySelector('button[aria-label="New issue"]');
          if (button instanceof HTMLElement) {
            button.click();
            return true;
          }
          window.dispatchEvent(new KeyboardEvent('keydown', {
            code: 'KeyN', key: 'n', altKey: true, bubbles: true, cancelable: true
          }));
          return false;
        })();
        """
        evaluateOrQueueUnique(script)
    }

    private func dispatchEventIfReady(named eventName: String) {
        let safeEventName = eventName.replacingOccurrences(of: "'", with: "")
        guard loadState == .ready, let webView else { return }
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('\(safeEventName)', { detail: { at: Date.now(), source: 'macos' } }));"
        ) { _, error in
            if let error {
                NSLog("Git Master JavaScript bridge error: %@", error.localizedDescription)
            }
        }
    }

    private func evaluateOrQueueUnique(_ script: String) {
        guard loadState == .ready, let webView else {
            if !pendingScripts.contains(script) {
                pendingScripts.append(script)
            }
            return
        }
        webView.evaluateJavaScript(script) { _, error in
            if let error {
                NSLog("Git Master JavaScript bridge error: %@", error.localizedDescription)
            }
        }
    }

    private func flushPendingScripts() {
        guard let webView, !pendingScripts.isEmpty else { return }
        let scripts = pendingScripts
        pendingScripts.removeAll()
        scripts.forEach { script in
            webView.evaluateJavaScript(script) { _, error in
                if let error {
                    NSLog("Git Master queued JavaScript bridge error: %@", error.localizedDescription)
                }
            }
        }
    }
}
