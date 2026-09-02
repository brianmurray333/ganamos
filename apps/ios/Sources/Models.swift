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
    let expiresAt: Date?
    let group: PostGroup?
    let userID: UUID?
    let fixed: Bool?
    let underReview: Bool?
    let deletedAt: Date?
    let submittedFixByID: UUID?
    let submittedFixByName: String?
    let submittedFixByAvatar: URL?
    let submittedFixImageURL: URL?
    let submittedFixNote: String?
    let submittedFixProofText: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, location, latitude, longitude, reward, group
        case imageURL = "image_url"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case userID = "user_id"
        case fixed
        case underReview = "under_review"
        case deletedAt = "deleted_at"
        case submittedFixByID = "submitted_fix_by_id"
        case submittedFixByName = "submitted_fix_by_name"
        case submittedFixByAvatar = "submitted_fix_by_avatar"
        case submittedFixImageURL = "submitted_fix_image_url"
        case submittedFixNote = "submitted_fix_note"
        case submittedFixProofText = "submitted_fix_proof_text"
    }
}

struct ClaimResult: Decodable, Sendable {
    let success: Bool
    let error: String?
}

struct DonationInvoice: Decodable, Sendable {
    let success: Bool
    let paymentRequest: String
    let paymentHash: String
    let poolID: UUID
    let amount: Int

    enum CodingKeys: String, CodingKey {
        case success, paymentRequest, paymentHash, amount
        case poolID = "poolId"
    }
}

struct DonationStatus: Decodable, Sendable {
    let success: Bool
    let settled: Bool
    let amountPaid: Int?
    let error: String?
}

struct FixReviewResult: Decodable, Sendable {
    let success: Bool
    let approved: Bool
    let postID: UUID
    let transactionID: UUID?
    let newBalance: Int?

    enum CodingKeys: String, CodingKey {
        case success, approved
        case postID = "post_id"
        case transactionID = "transaction_id"
        case newBalance = "new_balance"
    }
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

struct UserProfile: Decodable, Identifiable, Hashable, Sendable {
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

struct ProfileOverview: Sendable {
    let postsCount: Int
    let familyMembers: [FamilyMember]
    let pet: UserPet?

    init(postsCount: Int, familyMembers: [FamilyMember], pet: UserPet? = nil) {
        self.postsCount = postsCount
        self.familyMembers = familyMembers
        self.pet = pet
    }
}

struct UserPet: Decodable, Hashable, Sendable {
    let name: String
    let type: String

    init(name: String, type: String) {
        self.name = name
        self.type = type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedName = try container.decodeIfPresent(String.self, forKey: .name)
        // A device row means the pet is connected even when its optional
        // personalization fields have not been saved yet. Mobile web keeps
        // that state active with a `Pet` label and the default cat glyph.
        if let decodedName, !decodedName.isEmpty {
            name = decodedName
        } else {
            name = "Pet"
        }
        type = try container.decodeIfPresent(String.self, forKey: .type) ?? ""
    }

    enum CodingKeys: String, CodingKey {
        case name = "pet_name"
        case type = "pet_type"
    }
}

struct FamilyMember: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String?
    let username: String?
    let avatarURL: URL?
    let balance: Int

    enum CodingKeys: String, CodingKey {
        case id, name, username, balance
        case avatarURL = "avatar_url"
    }
}

struct FamilyAccount: Identifiable, Hashable, Sendable {
    enum Kind: String, Sendable { case child, quickContact }
    let member: FamilyMember
    let kind: Kind
    var id: UUID { member.id }
}

struct ChildAccountResponse: Decodable, Sendable {
    let success: Bool
    let profile: FamilyMember
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

struct WalletActionResponse: Decodable, Sendable {
    let success: Bool
    let error: String?
    let newBalance: Int?

    enum CodingKeys: String, CodingKey {
        case success, error
        case newBalance = "newBalance"
    }
}

struct AccountActivity: Decodable, Identifiable, Sendable {
    let id: UUID
    let type: String
    let relatedID: UUID?
    let timestamp: Date
    let metadata: ActivityMetadata?

    enum CodingKeys: String, CodingKey {
        case id, type, timestamp, metadata
        case relatedID = "related_id"
    }
}

struct ActivityMetadata: Decodable, Sendable {
    let title: String?
    let reward: Int?
    let amount: Int?
    let fixerName: String?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case title, reward, amount, status
        case fixerName = "fixer_name"
    }
}

struct UserGroup: Decodable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let description: String?
    let memberCount: Int?
    let groupCode: String?
    let inviteCode: String?
    let createdBy: UUID?

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case memberCount = "member_count"
        case groupCode = "group_code"
        case inviteCode = "invite_code"
        case createdBy = "created_by"
    }
}

struct GroupMember: Decodable, Identifiable, Sendable {
    let id: UUID
    let userID: UUID
    let role: String
    let status: String
    let profile: GroupMemberProfile?

    enum CodingKeys: String, CodingKey {
        case id, role, status, profile
        case userID = "user_id"
    }
}

struct GroupMemberProfile: Decodable, Sendable {
    let name: String?
    let username: String?
    let avatarURL: URL?

    enum CodingKeys: String, CodingKey {
        case name, username
        case avatarURL = "avatar_url"
    }
}

struct GroupMemberReviewResult: Decodable, Sendable {
    let success: Bool
    let status: String
    let memberID: UUID
    enum CodingKeys: String, CodingKey {
        case success, status
        case memberID = "member_id"
    }
}

struct AdminStats: Sendable {
    let users: Int
    let posts: Int
    let transactions: Int
    let orders: Int
}
