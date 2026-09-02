import Foundation
import Observation

@MainActor @Observable
final class SessionStore {
    private(set) var accessToken: String?
    private(set) var primaryUserID: UUID?
    private(set) var activeUserID: UUID?
    private(set) var userID: UUID?
    private(set) var email: String?
    private(set) var profile: UserProfile?
    private(set) var mainProfile: UserProfile?
    private(set) var connectedAccounts: [UserProfile] = []
    private(set) var isRestoring = false
    var isPresentingLogin = false
    var authPresentation: AuthPresentation = .login

    init() {
        accessToken = KeychainStore.read(account: "accessToken")
        primaryUserID = UserDefaults.standard.string(forKey: "sessionUserID").flatMap(UUID.init(uuidString:))
        activeUserID = UserDefaults.standard.string(forKey: "activeUserID").flatMap(UUID.init(uuidString:))
        userID = activeUserID ?? primaryUserID
        email = UserDefaults.standard.string(forKey: "sessionEmail")
    }

    var isAuthenticated: Bool { accessToken != nil }

    func signIn(email: String, password: String) async throws {
        let response = try await APIClient.shared.signIn(email: email, password: password)
        try persist(response, fallbackEmail: email)
        isPresentingLogin = false
        try await refreshProfile()
    }

    func signUp(email: String, password: String, name: String) async throws {
        try await APIClient.shared.signUp(email: email, password: password, name: name)
    }

    func completeOAuth(callbackURL: URL) async throws {
        let values = Self.oauthValues(from: callbackURL)
        guard let accessToken = values["access_token"],
              let refreshToken = values["refresh_token"] else {
            throw APIError.server(values["error_description"] ?? "Google sign-in did not return a session.")
        }
        let user = try await APIClient.shared.authUser(accessToken: accessToken)
        let response = AuthResponse(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: Int(values["expires_in"] ?? "3600") ?? 3600,
            user: user)
        try persist(response, fallbackEmail: user.email)
        isPresentingLogin = false
        try await refreshProfile()
    }

    func sendPhoneCode(phone: String) async throws {
        try await APIClient.shared.sendPhoneCode(phone: phone)
    }

    func verifyPhoneCode(phone: String, code: String) async throws {
        let response = try await APIClient.shared.verifyPhoneCode(phone: phone, code: code)
        try persist(response, fallbackEmail: nil)
        isPresentingLogin = false
        try await refreshProfile()
    }

    func sendPasswordReset(email: String) async throws {
        try await APIClient.shared.sendPasswordReset(email: email)
    }

    func restore() async {
        guard !isRestoring, let refreshToken = KeychainStore.read(account: "refreshToken") else { return }
        isRestoring = true
        defer { isRestoring = false }
        do {
            let response = try await APIClient.shared.refreshSession(refreshToken: refreshToken)
            try persist(response, fallbackEmail: email, preservesActiveAccount: true)
            try await refreshProfile()
        } catch {
            signOut()
        }
    }

    func refreshProfile() async throws {
        guard let accessToken, let primaryUserID else { return }

        let accounts = (try? await APIClient.shared.familyAccounts(
            accessToken: accessToken,
            userID: primaryUserID)) ?? []
        var childProfiles: [UserProfile] = []
        for account in accounts where account.kind == .child {
            if let child = try? await APIClient.shared.profile(
                accessToken: accessToken,
                userID: account.id) {
                childProfiles.append(child)
            }
        }
        connectedAccounts = childProfiles

        let main = try await APIClient.shared.profile(accessToken: accessToken, userID: primaryUserID)
        mainProfile = main
        guard
            let activeUserID,
            let active = childProfiles.first(where: { $0.id == activeUserID })
        else {
            resetToMainAccount(profile: main)
            return
        }
        userID = activeUserID
        profile = active
    }

    var isConnectedAccount: Bool { activeUserID != nil }

    func switchToAccount(_ account: UserProfile) {
        guard connectedAccounts.contains(where: { $0.id == account.id }) else { return }
        activeUserID = account.id
        userID = account.id
        profile = account
        UserDefaults.standard.set(account.id.uuidString, forKey: "activeUserID")
    }

    func resetToMainAccount() {
        guard let mainProfile else { return }
        resetToMainAccount(profile: mainProfile)
    }

    func signOut() {
        KeychainStore.delete(account: "accessToken")
        KeychainStore.delete(account: "refreshToken")
        UserDefaults.standard.removeObject(forKey: "sessionEmail")
        UserDefaults.standard.removeObject(forKey: "sessionUserID")
        UserDefaults.standard.removeObject(forKey: "activeUserID")
        accessToken = nil
        primaryUserID = nil
        activeUserID = nil
        userID = nil
        email = nil
        profile = nil
        mainProfile = nil
        connectedAccounts = []
    }

#if DEBUG
    func installRegressionSession(accessToken: String, refreshToken: String, userID: UUID, email: String?) throws {
        try KeychainStore.save(accessToken, account: "accessToken")
        try KeychainStore.save(refreshToken, account: "refreshToken")
        self.accessToken = accessToken
        self.primaryUserID = userID
        self.activeUserID = nil
        self.userID = userID
        self.email = email
        UserDefaults.standard.set(email, forKey: "sessionEmail")
        UserDefaults.standard.set(userID.uuidString, forKey: "sessionUserID")
        UserDefaults.standard.removeObject(forKey: "activeUserID")
    }

    func installRegressionProfile(_ profile: UserProfile) {
        accessToken = "regression-preview-token"
        primaryUserID = profile.id
        activeUserID = nil
        userID = profile.id
        email = profile.email
        self.profile = profile
        mainProfile = profile
        connectedAccounts = []
        UserDefaults.standard.removeObject(forKey: "activeUserID")
    }

    func installRegressionAccountContext(main: UserProfile, connected: [UserProfile]) {
        installRegressionProfile(main)
        connectedAccounts = connected
    }
#endif

    private func persist(
        _ response: AuthResponse,
        fallbackEmail: String?,
        preservesActiveAccount: Bool = false
    ) throws {
        try KeychainStore.save(response.accessToken, account: "accessToken")
        try KeychainStore.save(response.refreshToken, account: "refreshToken")
        accessToken = response.accessToken
        primaryUserID = response.user.id
        if !preservesActiveAccount {
            activeUserID = nil
            UserDefaults.standard.removeObject(forKey: "activeUserID")
        }
        userID = activeUserID ?? response.user.id
        email = response.user.email ?? fallbackEmail
        UserDefaults.standard.set(email, forKey: "sessionEmail")
        UserDefaults.standard.set(response.user.id.uuidString, forKey: "sessionUserID")
    }

    private func resetToMainAccount(profile: UserProfile) {
        activeUserID = nil
        userID = profile.id
        self.profile = profile
        UserDefaults.standard.removeObject(forKey: "activeUserID")
    }

    private static func oauthValues(from url: URL) -> [String: String] {
        let raw = [url.query, url.fragment].compactMap { $0 }.joined(separator: "&")
        return raw.split(separator: "&").reduce(into: [:]) { result, pair in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return }
            result[parts[0]] = parts[1].removingPercentEncoding ?? parts[1]
        }
    }
}

enum AuthPresentation {
    case login, signUp
}
