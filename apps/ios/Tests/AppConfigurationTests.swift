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

    func testTransactionDecodesExistingWebShape() throws {
        let json = #"{"id":"00000000-0000-0000-0000-000000000001","type":"deposit","amount":500,"status":"completed","memo":"Lightning deposit","created_at":"2026-08-02T12:00:00Z"}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let transaction = try decoder.decode(WalletTransaction.self, from: json)
        XCTAssertEqual(transaction.amount, 500)
        XCTAssertEqual(transaction.type, .deposit)
    }
}
