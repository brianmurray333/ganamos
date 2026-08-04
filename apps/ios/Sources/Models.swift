import Foundation

struct GanamosPost: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String?
    let description: String
    let imageURL: URL?
    let location: String?
    let latitude: Double?
    let longitude: Double?
    let reward: Int
    let createdAt: Date?
    let group: PostGroup?
    let userID: UUID?
    let fixed: Bool?
    let underReview: Bool?
    let deletedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, description, location, latitude, longitude, reward, group
        case imageURL = "image_url"
        case createdAt = "created_at"
        case userID = "user_id"
        case fixed
        case underReview = "under_review"
        case deletedAt = "deleted_at"
    }
}

struct ClaimResult: Decodable, Sendable {
    let success: Bool
    let error: String?
}

struct CreatePostResult: Decodable, Sendable {
    let success: Bool
    let postID: UUID
    let transactionID: UUID?
    let newBalance: Int

    enum CodingKeys: String, CodingKey {
        case success
        case postID = "post_id"
        case transactionID = "transaction_id"
        case newBalance = "new_balance"
    }
}

struct PostGroup: Codable, Hashable, Sendable {
    let id: UUID
    let name: String
    let description: String?
}

struct AuthResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let user: AuthUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case user
    }
}

struct AuthUser: Decodable, Sendable {
    let id: UUID
    let email: String?
}

struct UserProfile: Decodable, Sendable {
    let id: UUID
    let email: String?
    let name: String?
    let username: String?
    let avatarURL: URL?
    let balance: Int
    let fixedIssuesCount: Int

    enum CodingKeys: String, CodingKey {
        case id, email, name, username, balance
        case avatarURL = "avatar_url"
        case fixedIssuesCount = "fixed_issues_count"
    }
}

struct WalletTransaction: Decodable, Identifiable, Sendable {
    let id: UUID
    let type: Kind
    let amount: Int
    let status: Status
    let memo: String?
    let createdAt: Date

    enum Kind: String, Decodable, Sendable { case deposit, withdrawal, internalTransfer = "internal" }
    enum Status: String, Decodable, Sendable { case pending, completed, failed }
    enum CodingKeys: String, CodingKey {
        case id, type, amount, status, memo
        case createdAt = "created_at"
    }
}
