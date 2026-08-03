import Foundation
import Observation

@MainActor @Observable
final class SessionStore {
    private(set) var accessToken: String?
    private(set) var userID: UUID?
    private(set) var email: String?
    private(set) var profile: UserProfile?
    private(set) var isRestoring = false
    var isPresentingLogin = false

    init() {
        accessToken = KeychainStore.read(account: "accessToken")
        userID = UserDefaults.standard.string(forKey: "sessionUserID").flatMap(UUID.init(uuidString:))
        email = UserDefaults.standard.string(forKey: "sessionEmail")
    }

    var isAuthenticated: Bool { accessToken != nil }

    func signIn(email: String, password: String) async throws {
        let response = try await APIClient.shared.signIn(email: email, password: password)
        try persist(response, fallbackEmail: email)
        isPresentingLogin = false
        try await refreshProfile()
    }

    func restore() async {
        guard !isRestoring, let refreshToken = KeychainStore.read(account: "refreshToken") else { return }
        isRestoring = true
        defer { isRestoring = false }
        do {
            let response = try await APIClient.shared.refreshSession(refreshToken: refreshToken)
            try persist(response, fallbackEmail: email)
            try await refreshProfile()
        } catch {
            signOut()
        }
    }

    func refreshProfile() async throws {
        guard let accessToken, let userID else { return }
        profile = try await APIClient.shared.profile(accessToken: accessToken, userID: userID)
    }

    func signOut() {
        KeychainStore.delete(account: "accessToken")
        KeychainStore.delete(account: "refreshToken")
        UserDefaults.standard.removeObject(forKey: "sessionEmail")
        UserDefaults.standard.removeObject(forKey: "sessionUserID")
        accessToken = nil
        userID = nil
        email = nil
        profile = nil
    }

    private func persist(_ response: AuthResponse, fallbackEmail: String?) throws {
        try KeychainStore.save(response.accessToken, account: "accessToken")
        try KeychainStore.save(response.refreshToken, account: "refreshToken")
        accessToken = response.accessToken
        userID = response.user.id
        email = response.user.email ?? fallbackEmail
        UserDefaults.standard.set(email, forKey: "sessionEmail")
        UserDefaults.standard.set(userID?.uuidString, forKey: "sessionUserID")
    }
}
