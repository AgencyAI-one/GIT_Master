import AppKit
import SwiftUI
import WebKit

struct GitMasterWebView: NSViewRepresentable {
    let serverURL: URL
    let voiceHotkey: HotkeyBinding
    let newIssueHotkey: HotkeyBinding
    @ObservedObject var bridge: WebBridge

    func makeCoordinator() -> Coordinator {
        Coordinator(bridge: bridge)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let desktopScript = WKUserScript(
            source: Self.desktopInitializationScript(voice: voiceHotkey, newIssue: newIssueHotkey),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(desktopScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsMagnification = true
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = .windowBackgroundColor

        context.coordinator.configuredServerURL = serverURL
        context.coordinator.configuredVoiceHotkey = voiceHotkey
        context.coordinator.configuredNewIssueHotkey = newIssueHotkey
        bridge.attach(webView)
        bridge.setLoadState(.loading)
        webView.load(URLRequest(url: serverURL))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.configuredServerURL != serverURL {
            context.coordinator.configuredServerURL = serverURL
            bridge.load(serverURL)
        }

        if context.coordinator.configuredVoiceHotkey != voiceHotkey
            || context.coordinator.configuredNewIssueHotkey != newIssueHotkey {
            context.coordinator.configuredVoiceHotkey = voiceHotkey
            context.coordinator.configuredNewIssueHotkey = newIssueHotkey
            webView.evaluateJavaScript(Self.shortcutUpdateScript(voice: voiceHotkey, newIssue: newIssueHotkey))
        }
    }

    private struct WebShortcut: Encodable {
        let code: String
        let altKey: Bool
        let ctrlKey: Bool
        let shiftKey: Bool
        let metaKey: Bool

        init?(_ binding: HotkeyBinding) {
            guard let code = binding.domCode else { return nil }
            self.code = code
            altKey = binding.modifiers.contains(.option)
            ctrlKey = binding.modifiers.contains(.control)
            shiftKey = binding.modifiers.contains(.shift)
            metaKey = binding.modifiers.contains(.command)
        }
    }

    private struct WebShortcuts: Encodable {
        let voice: WebShortcut?
        let newIssue: WebShortcut?
    }

    private static func shortcutsJSON(voice: HotkeyBinding, newIssue: HotkeyBinding) -> String {
        let shortcuts = WebShortcuts(voice: WebShortcut(voice), newIssue: WebShortcut(newIssue))
        guard let data = try? JSONEncoder().encode(shortcuts),
              let json = String(data: data, encoding: .utf8) else {
            return "{\"voice\":null,\"newIssue\":null}"
        }
        return json
    }

    private static func desktopInitializationScript(voice: HotkeyBinding, newIssue: HotkeyBinding) -> String {
        """
        window.__GIT_MASTER_DESKTOP__ = true;
        window.__GIT_MASTER_NATIVE__ = { platform: 'macos', shell: 'xcode-companion' };
        window.__GIT_MASTER_NATIVE_SHORTCUTS__ = \(shortcutsJSON(voice: voice, newIssue: newIssue));
        window.__GIT_MASTER_NATIVE_ACTIVE_KEYS__ = new Set();
        window.__GIT_MASTER_NATIVE_SET_SHORTCUTS__ = (value) => {
          window.__GIT_MASTER_NATIVE_SHORTCUTS__ = value || { voice: null, newIssue: null };
          window.__GIT_MASTER_NATIVE_ACTIVE_KEYS__.clear();
        };
        window.addEventListener('keydown', (event) => {
          const shortcuts = window.__GIT_MASTER_NATIVE_SHORTCUTS__ || {};
          const matches = (binding) => binding
            && event.code === binding.code
            && event.altKey === binding.altKey
            && event.ctrlKey === binding.ctrlKey
            && event.shiftKey === binding.shiftKey
            && event.metaKey === binding.metaKey;
          if (matches(shortcuts.voice) || matches(shortcuts.newIssue)) {
            window.__GIT_MASTER_NATIVE_ACTIVE_KEYS__.add(event.code);
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        window.addEventListener('keyup', (event) => {
          if (window.__GIT_MASTER_NATIVE_ACTIVE_KEYS__.has(event.code)) {
            window.__GIT_MASTER_NATIVE_ACTIVE_KEYS__.delete(event.code);
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        """
    }

    private static func shortcutUpdateScript(voice: HotkeyBinding, newIssue: HotkeyBinding) -> String {
        "window.__GIT_MASTER_NATIVE_SET_SHORTCUTS__?.(\(shortcutsJSON(voice: voice, newIssue: newIssue)));"
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let bridge: WebBridge
        var configuredServerURL: URL?
        var configuredVoiceHotkey: HotkeyBinding?
        var configuredNewIssueHotkey: HotkeyBinding?

        init(bridge: WebBridge) {
            self.bridge = bridge
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            bridge.setLoadState(.loading)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if let configuredVoiceHotkey, let configuredNewIssueHotkey {
                webView.evaluateJavaScript(
                    GitMasterWebView.shortcutUpdateScript(
                        voice: configuredVoiceHotkey,
                        newIssue: configuredNewIssueHotkey
                    )
                )
            }
            bridge.setLoadState(.ready)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            bridge.setLoadState(.failed(error.localizedDescription))
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            bridge.setLoadState(.failed(error.localizedDescription))
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                NSWorkspace.shared.open(url)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.targetFrame?.isMainFrame == true,
                  let url = navigationAction.request.url,
                  !isInternalWebViewURL(url),
                  !isTrusted(url: url) else {
                decisionHandler(.allow)
                return
            }
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }

        @available(macOS 12.0, *)
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            guard type == .microphone, isTrusted(origin: origin) else {
                decisionHandler(.deny)
                return
            }
            decisionHandler(.grant)
        }

        private func isTrusted(origin: WKSecurityOrigin) -> Bool {
            guard let configuredServerURL else { return false }
            let expectedPort = configuredServerURL.port ?? defaultPort(for: configuredServerURL.scheme)
            let portMatches = origin.port == expectedPort || (configuredServerURL.port == nil && origin.port == 0)
            return origin.protocol == configuredServerURL.scheme
                && origin.host.caseInsensitiveCompare(configuredServerURL.host ?? "") == .orderedSame
                && portMatches
        }

        private func isTrusted(url: URL) -> Bool {
            guard let configuredServerURL else { return false }
            let expectedPort = configuredServerURL.port ?? defaultPort(for: configuredServerURL.scheme)
            let candidatePort = url.port ?? defaultPort(for: url.scheme)
            return url.scheme == configuredServerURL.scheme
                && url.host?.caseInsensitiveCompare(configuredServerURL.host ?? "") == .orderedSame
                && candidatePort == expectedPort
        }

        private func isInternalWebViewURL(_ url: URL) -> Bool {
            guard let scheme = url.scheme else { return false }
            return ["about", "blob", "data"].contains(scheme)
        }

        private func defaultPort(for scheme: String?) -> Int {
            scheme == "https" ? 443 : 80
        }
    }
}
