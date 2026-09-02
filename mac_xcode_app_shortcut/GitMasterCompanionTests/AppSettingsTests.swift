import XCTest
@testable import GitMasterCompanion

@MainActor
final class AppSettingsTests: XCTestCase {
    func testValidServerURLIsPersisted() throws {
        let (defaults, suiteName) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let settings = AppSettings(defaults: defaults)
        let result = settings.setServerURL(" https://git-master.example.com ")

        guard case .success(let url) = result else {
            return XCTFail("Expected a valid server URL")
        }
        XCTAssertEqual(url.absoluteString, "https://git-master.example.com")
        XCTAssertEqual(AppSettings(defaults: defaults).serverURL, url)
    }

    func testServerURLRejectsCredentialsAndUnsupportedSchemes() {
        let (defaults, suiteName) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let settings = AppSettings(defaults: defaults)

        guard case .failure(.invalid) = settings.setServerURL("https://user:secret@example.com") else {
            return XCTFail("Credentials must not be persisted in a server URL")
        }
        guard case .failure(.unsupportedScheme) = settings.setServerURL("file://example.com/tmp") else {
            return XCTFail("Only HTTP and HTTPS should be accepted")
        }
    }

    func testPlainHTTPIsLimitedToLoopbackDevelopment() {
        let (defaults, suiteName) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let settings = AppSettings(defaults: defaults)

        for address in ["http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"] {
            guard case .success = settings.setServerURL(address) else {
                return XCTFail("Expected loopback URL to be accepted: \(address)")
            }
        }

        guard case .failure(.insecureRemoteURL) = settings.setServerURL("http://git-master.example.com") else {
            return XCTFail("Remote plain HTTP must be rejected")
        }
    }

    func testPersistedRemotePlainHTTPFallsBackToLocalDevelopmentURL() {
        let (defaults, suiteName) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set("http://git-master.example.com", forKey: "serverURL")

        let settings = AppSettings(defaults: defaults)

        XCTAssertEqual(settings.serverURL.absoluteString, "http://127.0.0.1:5173")
    }

    func testHotkeysArePersisted() {
        let (defaults, suiteName) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let settings = AppSettings(defaults: defaults)
        let customVoice = HotkeyBinding(keyCode: 9, modifiers: [.command, .shift])

        settings.voiceHotkey = customVoice

        XCTAssertEqual(AppSettings(defaults: defaults).voiceHotkey, customVoice)
    }

    private func makeDefaults() -> (UserDefaults, String) {
        let suiteName = "GitMasterCompanionTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return (defaults, suiteName)
    }
}
