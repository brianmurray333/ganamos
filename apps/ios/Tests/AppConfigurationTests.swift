import XCTest
@testable import Ganamos

final class AppConfigurationTests: XCTestCase {
    func testProductionFallbackUsesHTTPS() {
        XCTAssertEqual(AppConfiguration.current.apiBaseURL.scheme, "https")
    }

    func testPostDecodesExistingWebShape() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","title":"Fix the park","description":"Broken bench","image_url":null,"location":"Mission","latitude":37.7,"longitude":-122.4,"reward":500,"created_at":"2026-08-02T12:00:00Z","group":null}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let post = try decoder.decode(GanamosPost.self, from: json)
        XCTAssertEqual(post.reward, 500)
        XCTAssertEqual(post.location, "Mission")
        XCTAssertEqual(post.latitude, 37.7)
    }

    func testProfileDecodesExistingWebShape() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","email":"brian@example.com","name":"Brian","username":"brian","avatar_url":null,"balance":1200,"fixed_issues_count":4}"#.data(using: .utf8)!
        let profile = try JSONDecoder().decode(UserProfile.self, from: json)
        XCTAssertEqual(profile.balance, 1200)
        XCTAssertEqual(profile.fixedIssuesCount, 4)
    }

    func testConnectedPetDecodesMissingPersonalizationAsActiveFallback() throws {
        let nullJSON = #"{"pet_name":null,"pet_type":null}"#.data(using: .utf8)!
        let emptyJSON = #"{"pet_name":"","pet_type":""}"#.data(using: .utf8)!

        for json in [nullJSON, emptyJSON] {
            let pet = try JSONDecoder().decode(UserPet.self, from: json)
            XCTAssertEqual(pet.name, "Pet")
            XCTAssertEqual(pet.type, "")
        }
    }

    func testTransactionDecodesExistingWebShape() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","type":"deposit","amount":500,"status":"completed","memo":"Lightning deposit","created_at":"2026-08-02T12:00:00Z"}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let transaction = try decoder.decode(WalletTransaction.self, from: json)
        XCTAssertEqual(transaction.amount, 500)
        XCTAssertEqual(transaction.type, .deposit)
    }

    func testUnauthorizedResponseNeverExposesJWTMessage() async {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [UnauthorizedURLProtocol.self]
        let client = APIClient(
            configuration: AppConfiguration(
                apiBaseURL: URL(string: "https://example.com")!,
                supabaseURL: URL(string: "https://example.com")!,
                supabaseAnonKey: "anon-key"),
            session: URLSession(configuration: configuration))
        let expiryBroadcast = expectation(description: "Session expiry is broadcast")
        let observer = NotificationCenter.default.addObserver(
            forName: .ganamosSessionExpired,
            object: nil,
            queue: nil) { notification in
                XCTAssertEqual(
                    notification.object as? SessionExpirationContext,
                    SessionExpirationContext(accessToken: "expired-token"))
                expiryBroadcast.fulfill()
            }
        defer { NotificationCenter.default.removeObserver(observer) }

        do {
            _ = try await client.posts(accessToken: "expired-token")
            XCTFail("Expected an expired session error")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Your session has expired. Please sign in again.")
            XCTAssertFalse(error.localizedDescription.localizedCaseInsensitiveContains("JWT"))
        }
        await fulfillment(of: [expiryBroadcast], timeout: 1)
    }

    @MainActor
    func testExpiredSessionClearsCredentialsAndPresentsLoginOnce() throws {
        let store = SessionStore()
        store.signOut()
        try store.installRegressionSession(
            accessToken: "expired-access-token",
            refreshToken: "expired-refresh-token",
            userID: UUID(),
            email: "person@example.com")

        store.handleSessionExpired()
        store.handleSessionExpired()

        XCTAssertFalse(store.isAuthenticated)
        XCTAssertNil(KeychainStore.read(account: "accessToken"))
        XCTAssertNil(KeychainStore.read(account: "refreshToken"))
        XCTAssertTrue(store.isPresentingLogin)
        XCTAssertEqual(store.authNotice, "Your session has expired. Please sign in again.")
    }

    @MainActor
    func testStaleUnauthorizedResponseCannotExpireCurrentSession() async throws {
        let store = SessionStore()
        store.signOut()
        try store.installRegressionSession(
            accessToken: "current-access-token",
            refreshToken: "current-refresh-token",
            userID: UUID(),
            email: "person@example.com")

        await store.recoverSessionAfterExpiration(
            context: SessionExpirationContext(accessToken: "stale-access-token"))

        XCTAssertTrue(store.isAuthenticated)
        XCTAssertEqual(store.accessToken, "current-access-token")
        XCTAssertFalse(store.isPresentingLogin)
        XCTAssertNil(store.authNotice)
    }
}

private final class UnauthorizedURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 401,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"message":"JWT expired"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
