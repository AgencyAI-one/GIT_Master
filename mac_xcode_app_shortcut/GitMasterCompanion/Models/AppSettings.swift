import Combine
import Foundation

@MainActor
final class AppSettings: ObservableObject {
    private enum Key {
        static let serverURL = "serverURL"
        static let voiceHotkey = "voiceHotkey"
        static let newIssueHotkey = "newIssueHotkey"
    }

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()

    @Published private(set) var serverURL: URL

    @Published var voiceHotkey: HotkeyBinding {
        didSet { save(voiceHotkey, forKey: Key.voiceHotkey) }
    }

    @Published var newIssueHotkey: HotkeyBinding {
        didSet { save(newIssueHotkey, forKey: Key.newIssueHotkey) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let decoder = JSONDecoder()
        let defaultURL = URL(string: "http://127.0.0.1:5173")!
        if let rawURL = defaults.string(forKey: Key.serverURL),
           let storedURL = URL(string: rawURL),
           Self.isSafeStoredServerURL(storedURL) {
            serverURL = storedURL
        } else {
            serverURL = defaultURL
        }

        if let data = defaults.data(forKey: Key.voiceHotkey),
           let binding = try? decoder.decode(HotkeyBinding.self, from: data) {
            voiceHotkey = binding
        } else {
            voiceHotkey = .defaultVoice
        }

        if let data = defaults.data(forKey: Key.newIssueHotkey),
           let binding = try? decoder.decode(HotkeyBinding.self, from: data) {
            newIssueHotkey = binding
        } else {
            newIssueHotkey = .defaultNewIssue
        }

        if newIssueHotkey == voiceHotkey {
            newIssueHotkey = .defaultNewIssue
        }
    }

    @discardableResult
    func setServerURL(_ rawValue: String) -> Result<URL, ServerURLValidationError> {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .failure(.empty) }
        guard let url = URL(string: trimmed),
              url.host != nil,
              url.user == nil,
              url.password == nil else { return .failure(.invalid) }
        guard Self.isSupportedServerURL(url) else { return .failure(.unsupportedScheme) }
        guard Self.isSecureServerURL(url) else { return .failure(.insecureRemoteURL) }

        serverURL = url
        defaults.set(url.absoluteString, forKey: Key.serverURL)
        return .success(url)
    }

    private static func isSupportedServerURL(_ url: URL) -> Bool {
        url.scheme == "http" || url.scheme == "https"
    }

    private static func isSecureServerURL(_ url: URL) -> Bool {
        guard url.scheme == "http" else { return true }
        guard let host = url.host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
    }

    private static func isSafeStoredServerURL(_ url: URL) -> Bool {
        isSupportedServerURL(url)
            && isSecureServerURL(url)
            && url.host != nil
            && url.user == nil
            && url.password == nil
    }

    private func save<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? encoder.encode(value) else { return }
        defaults.set(data, forKey: key)
    }
}
