import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Connect the app to the existing Supabase project in Config/Local.xcconfig."
        case .invalidResponse: "Ganamos returned an unexpected response."
        case let .server(message): message
        }
    }
}

actor APIClient {
    static let shared = APIClient()
    private let configuration: AppConfiguration
    private let session: URLSession
    private let decoder: JSONDecoder

    init(configuration: AppConfiguration = .current, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) {
                return date
            }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Invalid ISO 8601 date: \(value)"
            )
        }
    }

    func signIn(email: String, password: String) async throws -> AuthResponse {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "password")]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "password": password])
        return try await decode(request, as: AuthResponse.self)
    }

    func googleOAuthURL() throws -> URL {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: "ganamos://auth-callback"),
        ]
        guard let url = components.url else { throw APIError.invalidResponse }
        return url
    }

    func authUser(accessToken: String) async throws -> AuthUser {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "auth/v1/user"), accessToken: accessToken)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        return try await decode(request, as: AuthUser.self)
    }

    func signUp(email: String, password: String, name: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: baseURL.appending(path: "auth/v1/signup"))
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password,
            "data": ["name": name]
        ])
        try await expectSuccess(request)
    }

    func sendPhoneCode(phone: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: baseURL.appending(path: "auth/v1/otp"))
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["phone": phone])
        try await expectSuccess(request)
    }

    func verifyPhoneCode(phone: String, code: String) async throws -> AuthResponse {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: baseURL.appending(path: "auth/v1/verify"))
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "phone": phone,
            "token": code,
            "type": "sms"
        ])
        return try await decode(request, as: AuthResponse.self)
    }

    func sendPasswordReset(email: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: baseURL.appending(path: "auth/v1/recover"))
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])
        try await expectSuccess(request)
    }

    func refreshSession(refreshToken: String) async throws -> AuthResponse {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refresh_token": refreshToken])
        return try await decode(request, as: AuthResponse.self)
    }

    func posts(accessToken: String?) async throws -> [GanamosPost] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,title,description,image_url,location,latitude,longitude,reward,created_at,expires_at,user_id,fixed,under_review,deleted_at,submitted_fix_by_id,submitted_fix_by_name,submitted_fix_by_avatar,submitted_fix_image_url,submitted_fix_note,submitted_fix_proof_text,group:group_id(id,name,description)"),
            URLQueryItem(name: "fixed", value: "eq.false"),
            URLQueryItem(name: "under_review", value: "neq.true"),
            URLQueryItem(name: "deleted_at", value: "is.null"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "30")
        ]
        var request = URLRequest(url: components.url!)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken ?? configuration.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        return try await decode(request, as: [GanamosPost].self)
    }

    func post(id: UUID, accessToken: String) async throws -> GanamosPost {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,title,description,image_url,location,latitude,longitude,reward,created_at,expires_at,user_id,fixed,under_review,deleted_at,submitted_fix_by_id,submitted_fix_by_name,submitted_fix_by_avatar,submitted_fix_image_url,submitted_fix_note,submitted_fix_proof_text,group:group_id(id,name,description)"),
            URLQueryItem(name: "id", value: "eq.\(id.uuidString.lowercased())"),
        ]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.setValue("application/vnd.pgrst.object+json", forHTTPHeaderField: "Accept")
        return try await decode(request, as: GanamosPost.self)
    }

    func isGroupAdmin(groupID: UUID, accessToken: String, userID: UUID) async throws -> Bool {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/group_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id"),
            URLQueryItem(name: "group_id", value: "eq.\(groupID.uuidString.lowercased())"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "role", value: "eq.admin"),
            URLQueryItem(name: "status", value: "eq.approved"),
            URLQueryItem(name: "limit", value: "1")
        ]
        struct Membership: Decodable { let id: UUID }
        let memberships = try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [Membership].self)
        return !memberships.isEmpty
    }

    func uploadPostImage(_ data: Data, accessToken: String, userID: UUID, folder: String) async throws -> URL {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        let path = "\(userID.uuidString.lowercased())/\(folder)/\(UUID().uuidString.lowercased()).jpg"
        var request = authorizedRequest(url: baseURL.appending(path: "storage/v1/object/post-images/\(path)"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.server("Photo upload failed.")
        }
        return baseURL.appending(path: "storage/v1/object/public/post-images/\(path)")
    }

    func createPost(
        title: String,
        description: String,
        location: String?,
        latitude: Double? = nil,
        longitude: Double? = nil,
        imageURL: URL?,
        reward: Int,
        groupID: UUID? = nil,
        assignedTo: UUID? = nil,
        expiresAt: Date? = nil,
        accessToken: String,
        userID: UUID,
        profile: UserProfile?
    ) async throws -> CreatePostResult {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/create_post_atomic"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let postID = UUID()
        var payload: [String: Any] = [
            "p_post_id": postID.uuidString.lowercased(),
            "p_user_id": userID.uuidString.lowercased(),
            "p_created_by": profile?.name ?? profile?.email ?? "Ganamos member",
            "p_title": title,
            "p_description": description,
            "p_has_image": imageURL != nil,
            "p_reward": reward,
            "p_memo": "Post reward [post:\(postID.uuidString.lowercased())]: \(String(description.prefix(50)))"
        ]
        if let avatar = profile?.avatarURL { payload["p_created_by_avatar"] = avatar.absoluteString }
        if let imageURL { payload["p_image_url"] = imageURL.absoluteString }
        if let location, !location.isEmpty { payload["p_location"] = location }
        if let latitude { payload["p_latitude"] = latitude }
        if let longitude { payload["p_longitude"] = longitude }
        if let groupID { payload["p_group_id"] = groupID.uuidString.lowercased() }
        if let assignedTo { payload["p_assigned_to"] = assignedTo.uuidString.lowercased() }
        if let location, !location.isEmpty { payload["p_city"] = location }
        if let expiresAt {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            payload["p_expires_at"] = formatter.string(from: expiresAt)
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        return try await decode(request, as: CreatePostResult.self)
    }

    func updatePostExpiration(postID: UUID, expiresAt: Date?, accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "id", value: "eq.\(postID.uuidString.lowercased())")
        ]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let iso: String? = expiresAt.map { date in
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.string(from: date)
        }
        let payload: [String: Any?] = ["expires_at": iso as Any]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload.mapValues { $0 ?? NSNull() })
        try await expectSuccess(request)
    }

    func submitFix(
        postID: UUID,
        proofText: String,
        note: String?,
        imageURL: URL?,
        accessToken: String,
        userID: UUID,
        profile: UserProfile?
    ) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/atomic_claim_job"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any?] = [
            "p_job_id": postID.uuidString.lowercased(), "p_fixer_id": userID.uuidString.lowercased(),
            "p_fixer_name": profile?.name ?? profile?.email ?? "Ganamos member",
            "p_fixer_avatar": profile?.avatarURL?.absoluteString, "p_fix_note": note,
            "p_fix_image_url": imageURL?.absoluteString, "p_fix_proof_text": proofText,
            "p_lightning_address": nil, "p_ai_confidence": nil, "p_ai_analysis": nil
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload.mapValues { $0 ?? NSNull() })
        let result = try await decode(request, as: ClaimResult.self)
        if !result.success { throw APIError.server(result.error ?? "This fix is no longer available.") }
    }

    func reviewFix(postID: UUID, approve: Bool, rejectionReason: String? = nil, accessToken: String) async throws -> FixReviewResult {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/review_submitted_fix_atomic"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any?] = [
            "p_post_id": postID.uuidString.lowercased(),
            "p_approve": approve,
            "p_rejection_reason": rejectionReason,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload.mapValues { $0 ?? NSNull() })
        return try await decode(request, as: FixReviewResult.self)
    }

    func closeIssue(postID: UUID, fixerUsername: String, accessToken: String) async throws -> FixReviewResult {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/close_issue_atomic"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_post_id": postID.uuidString.lowercased(),
            "p_fixer_username": fixerUsername,
        ])
        return try await decode(request, as: FixReviewResult.self)
    }

    private func expectSuccess(_ request: URLRequest) async throws {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError.server(payload?["message"] as? String ?? "Request failed (\(http.statusCode)).")
        }
    }

    func profile(accessToken: String, userID: UUID) async throws -> UserProfile {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/profiles"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,email,name,username,avatar_url,balance,fixed_issues_count"),
            URLQueryItem(name: "id", value: "eq.\(userID.uuidString.lowercased())")
        ]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.setValue("application/vnd.pgrst.object+json", forHTTPHeaderField: "Accept")
        return try await decode(request, as: UserProfile.self)
    }

    func updateProfile(name: String, username: String, avatarURL: String? = nil, accessToken: String, userID: UUID) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/profiles"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: "eq.\(userID.uuidString.lowercased())")]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload = ["name": name, "username": username]
        if let avatarURL { payload["avatar_url"] = avatarURL }
        request.httpBody = try JSONEncoder().encode(payload)
        try await expectSuccess(request)
    }

    func userGroups(accessToken: String, userID: UUID) async throws -> [UserGroup] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/group_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "group:group_id(id,name,description,member_count,group_code,invite_code,created_by)"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "status", value: "eq.approved")
        ]
        struct Row: Decodable { let group: UserGroup? }
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [Row].self).compactMap(\.group)
    }

    func createGroup(name: String, description: String?, accessToken: String, userID: UUID) async throws -> UserGroup {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        let groupID = UUID()
        let now = ISO8601DateFormatter().string(from: Date())
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let groupCode = String((0..<4).compactMap { _ in alphabet.randomElement() })
        let inviteCode = UUID().uuidString.lowercased()

        var groupRequest = authorizedRequest(url: baseURL.appending(path: "rest/v1/groups"), accessToken: accessToken)
        groupRequest.httpMethod = "POST"
        groupRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        groupRequest.setValue("return=representation", forHTTPHeaderField: "Prefer")
        let groupPayload: [String: Any] = [
            "id": groupID.uuidString.lowercased(),
            "name": name,
            "description": description ?? NSNull(),
            "created_by": userID.uuidString.lowercased(),
            "created_at": now,
            "updated_at": now,
            "invite_code": inviteCode,
            "group_code": groupCode
        ]
        groupRequest.httpBody = try JSONSerialization.data(withJSONObject: groupPayload)
        let groups = try await decode(groupRequest, as: [UserGroup].self)
        guard let group = groups.first else { throw APIError.invalidResponse }

        var memberRequest = authorizedRequest(url: baseURL.appending(path: "rest/v1/group_members"), accessToken: accessToken)
        memberRequest.httpMethod = "POST"
        memberRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        memberRequest.httpBody = try JSONSerialization.data(withJSONObject: [
            "id": UUID().uuidString.lowercased(),
            "group_id": groupID.uuidString.lowercased(),
            "user_id": userID.uuidString.lowercased(),
            "role": "admin",
            "status": "approved",
            "created_at": now,
            "updated_at": now
        ])
        try await expectSuccess(memberRequest)
        return group
    }

    func findGroup(code: String, accessToken: String) async throws -> UserGroup? {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/groups"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,name,description,member_count,group_code,invite_code,created_by"),
            URLQueryItem(name: "group_code", value: "eq.\(code.uppercased())"),
            URLQueryItem(name: "limit", value: "1")
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [UserGroup].self).first
    }

    func requestGroupMembership(groupID: UUID, accessToken: String, userID: UUID) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/group_members"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "id": UUID().uuidString.lowercased(),
            "group_id": groupID.uuidString.lowercased(),
            "user_id": userID.uuidString.lowercased(),
            "role": "member",
            "status": "pending"
        ])
        try await expectSuccess(request)
    }

    func groupMembers(groupID: UUID, accessToken: String) async throws -> [GroupMember] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/group_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,user_id,role,status,profile:user_id(name,username,avatar_url)"),
            URLQueryItem(name: "group_id", value: "eq.\(groupID.uuidString.lowercased())"),
            URLQueryItem(name: "order", value: "created_at.asc")
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [GroupMember].self)
    }

    func reviewGroupMember(memberID: UUID, approve: Bool, accessToken: String) async throws -> GroupMemberReviewResult {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/review_group_member_atomic"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "p_group_member_id": memberID.uuidString.lowercased(),
            "p_approve": approve,
        ])
        return try await decode(request, as: GroupMemberReviewResult.self)
    }

    func updateGroupMemberRole(memberID: UUID, role: String, accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/group_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: "eq.\(memberID.uuidString.lowercased())")]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["role": role, "updated_at": ISO8601DateFormatter().string(from: Date())])
        try await expectSuccess(request)
    }

    func removeGroupMember(memberID: UUID, accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/group_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: "eq.\(memberID.uuidString.lowercased())")]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.httpMethod = "DELETE"
        try await expectSuccess(request)
    }

    func deleteGroup(groupID: UUID, accessToken: String) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        func request(_ table: String, method: String, body: [String: Any]? = nil) throws -> URLRequest {
            var components = URLComponents(url: baseURL.appending(path: "rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "group_id", value: "eq.\(groupID.uuidString.lowercased())")]
            if table == "groups" { components.queryItems = [URLQueryItem(name: "id", value: "eq.\(groupID.uuidString.lowercased())")] }
            var result = authorizedRequest(url: components.url!, accessToken: accessToken)
            result.httpMethod = method
            if let body { result.setValue("application/json", forHTTPHeaderField: "Content-Type"); result.httpBody = try JSONSerialization.data(withJSONObject: body) }
            return result
        }
        try await expectSuccess(request("posts", method: "PATCH", body: ["group_id": NSNull()]))
        try await expectSuccess(request("group_members", method: "DELETE"))
        try await expectSuccess(request("groups", method: "DELETE"))
    }

    func postAudiencePeople(accessToken: String, userID: UUID) async throws -> [FamilyMember] {
        async let connected = connectedFamily(accessToken: accessToken, userID: userID)
        async let family = familyMembers(accessToken: accessToken, userID: userID)
        let members = try await (connected + family)
        var seen = Set<UUID>()
        return members.filter { seen.insert($0.id).inserted }.sorted {
            ($0.name ?? $0.username ?? "") < ($1.name ?? $1.username ?? "")
        }
    }

    func userPosts(accessToken: String, userID: UUID) async throws -> [GanamosPost] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,title,description,image_url,location,latitude,longitude,reward,created_at,expires_at,user_id,fixed,under_review,deleted_at,submitted_fix_by_id,submitted_fix_by_name,submitted_fix_by_avatar,submitted_fix_image_url,submitted_fix_note,submitted_fix_proof_text,group:group_id(id,name,description)"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "deleted_at", value: "is.null"),
            URLQueryItem(name: "order", value: "created_at.desc")
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [GanamosPost].self)
    }

    func adminStats(accessToken: String) async throws -> AdminStats {
        async let users = tableCount("profiles", accessToken: accessToken)
        async let posts = tableCount("posts", accessToken: accessToken)
        async let transactions = tableCount("transactions", accessToken: accessToken)
        async let orders = tableCount("pet_orders", accessToken: accessToken)
        return try await AdminStats(users: users, posts: posts, transactions: transactions, orders: orders)
    }

    private func tableCount(_ table: String, accessToken: String) async throws -> Int {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/\(table)"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "select", value: "id")]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.setValue("count=exact", forHTTPHeaderField: "Prefer")
        request.setValue("0-0", forHTTPHeaderField: "Range")
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw APIError.invalidResponse }
        return http.value(forHTTPHeaderField: "Content-Range")?.split(separator: "/").last.flatMap { Int($0) } ?? 0
    }

    func profileOverview(accessToken: String, userID: UUID) async throws -> ProfileOverview {
        async let postCount = authoredPostCount(accessToken: accessToken, userID: userID)
        async let connected = connectedFamily(accessToken: accessToken, userID: userID)
        async let family = familyMembers(accessToken: accessToken, userID: userID)
        async let pet = try? primaryPet(accessToken: accessToken, userID: userID)
        let members = try await (connected + family)
        var seen = Set<UUID>()
        return try await ProfileOverview(
            postsCount: postCount,
            familyMembers: members.filter { seen.insert($0.id).inserted }.sorted { $0.balance > $1.balance },
            pet: pet
        )
    }

    private func primaryPet(accessToken: String, userID: UUID) async throws -> UserPet? {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/devices"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "pet_name,pet_type"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: "1")
        ]
        return try await decode(
            authorizedRequest(url: components.url!, accessToken: accessToken),
            as: [UserPet].self
        ).first
    }

    func familyAccounts(accessToken: String, userID: UUID) async throws -> [FamilyAccount] {
        async let children = connectedFamily(accessToken: accessToken, userID: userID)
        async let contacts = familyMembers(accessToken: accessToken, userID: userID)
        let childAccounts = try await children.map { FamilyAccount(member: $0, kind: .child) }
        let quickContacts = try await contacts.map { FamilyAccount(member: $0, kind: .quickContact) }
        var seen = Set<UUID>()
        return (childAccounts + quickContacts).filter { seen.insert($0.id).inserted }.sorted { $0.member.balance > $1.member.balance }
    }

    func searchProfiles(query: String, accessToken: String, excluding userID: UUID) async throws -> [FamilyMember] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/profiles"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,name,username,avatar_url,balance"),
            URLQueryItem(name: "or", value: "(username.ilike.*\(clean)*,name.ilike.*\(clean)*)"),
            URLQueryItem(name: "id", value: "neq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "limit", value: "8"),
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [FamilyMember].self)
    }

    func addFamilyContact(memberID: UUID, accessToken: String, userID: UUID) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/family_members"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["user_id": userID.uuidString.lowercased(), "member_id": memberID.uuidString.lowercased()])
        try await expectSuccess(request)
    }

    func removeFamilyContact(memberID: UUID, accessToken: String, userID: UUID) async throws {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/family_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"), URLQueryItem(name: "member_id", value: "eq.\(memberID.uuidString.lowercased())")]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken); request.httpMethod = "DELETE"
        try await expectSuccess(request)
    }

    func createChildAccount(name: String, avatarURL: String, accessToken: String) async throws -> FamilyMember {
        var request = URLRequest(url: URL(string: "https://ganamos.earth/api/child-account")!)
        request.httpMethod = "POST"; request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["username": name, "avatarUrl": avatarURL])
        return try await decode(request, as: ChildAccountResponse.self).profile
    }

    func deleteChildAccount(id: UUID, accessToken: String) async throws {
        var request = URLRequest(url: URL(string: "https://ganamos.earth/api/soft-delete-child-account")!)
        request.httpMethod = "POST"; request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["childAccountId": id.uuidString.lowercased()])
        try await expectSuccess(request)
    }

    private func authoredPostCount(accessToken: String, userID: UUID) async throws -> Int {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/posts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())")
        ]
        var request = authorizedRequest(url: components.url!, accessToken: accessToken)
        request.setValue("count=exact", forHTTPHeaderField: "Prefer")
        request.setValue("0-0", forHTTPHeaderField: "Range")
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw APIError.invalidResponse }
        return http.value(forHTTPHeaderField: "Content-Range")?.split(separator: "/").last.flatMap { Int($0) } ?? 0
    }

    private func connectedFamily(accessToken: String, userID: UUID) async throws -> [FamilyMember] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/connected_accounts"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "profile:connected_user_id(id,name,username,avatar_url,balance)"),
            URLQueryItem(name: "primary_user_id", value: "eq.\(userID.uuidString.lowercased())")
        ]
        struct Row: Decodable { let profile: FamilyMember? }
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [Row].self).compactMap(\.profile)
    }

    private func familyMembers(accessToken: String, userID: UUID) async throws -> [FamilyMember] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/family_members"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "profile:member_id(id,name,username,avatar_url,balance)"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())")
        ]
        struct Row: Decodable { let profile: FamilyMember? }
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [Row].self).compactMap(\.profile)
    }

    func transactions(accessToken: String, userID: UUID, limit: Int = 20) async throws -> [WalletTransaction] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/transactions"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,type,amount,status,memo,created_at"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "order", value: "created_at.desc"),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [WalletTransaction].self)
    }

    func activities(accessToken: String, userID: UUID, limit: Int = 50) async throws -> [AccountActivity] {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var components = URLComponents(url: baseURL.appending(path: "rest/v1/activities"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,type,related_id,timestamp,metadata"),
            URLQueryItem(name: "user_id", value: "eq.\(userID.uuidString.lowercased())"),
            URLQueryItem(name: "order", value: "timestamp.desc"),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        return try await decode(authorizedRequest(url: components.url!, accessToken: accessToken), as: [AccountActivity].self)
    }

    func bitcoinPrice() async throws -> Double {
        let response = try await decode(URLRequest(url: URL(string: "https://ganamos.earth/api/bitcoin-price")!), as: BitcoinPriceResponse.self)
        return response.price
    }

    func createDonation(amount: Int, locationType: String, locationName: String, donorName: String?, message: String?) async throws -> DonationInvoice {
        var request = URLRequest(url: URL(string: "https://ganamos.earth/api/mobile/donations")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any?] = [
            "amount": amount,
            "locationType": locationType,
            "locationName": locationName,
            "donorName": donorName,
            "message": message,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload.mapValues { $0 ?? NSNull() })
        return try await decode(request, as: DonationInvoice.self)
    }

    func donationStatus(paymentHash: String) async throws -> DonationStatus {
        var components = URLComponents(string: "https://ganamos.earth/api/mobile/donations")!
        components.queryItems = [URLQueryItem(name: "payment_hash", value: paymentHash)]
        return try await decode(URLRequest(url: components.url!), as: DonationStatus.self)
    }

    func transferSats(to username: String, amount: Int, memo: String?, accessToken: String) async throws -> WalletActionResponse {
        var request = URLRequest(url: URL(string: "https://ganamos.earth/api/wallet/transfer")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "toUsername": username,
            "amount": amount,
            "memo": memo ?? "Sent from Ganamos for iOS",
        ])
        return try await decode(request, as: WalletActionResponse.self)
    }

    func payLightningInvoice(_ invoice: String, amount: Int, accessToken: String) async throws -> WalletActionResponse {
        var request = URLRequest(url: URL(string: "https://ganamos.earth/api/wallet/withdraw")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "paymentRequest": invoice,
            "amount": amount,
        ])
        return try await decode(request, as: WalletActionResponse.self)
    }

    private func authorizedRequest(url: URL, accessToken: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue(configuration.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func decode<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = payload?["msg"] as? String ?? payload?["message"] as? String ?? payload?["error_description"] as? String ?? "Request failed (\(http.statusCode))."
            throw APIError.server(message)
        }
        return try decoder.decode(type, from: data)
    }
}

private struct BitcoinPriceResponse: Decodable {
    let price: Double
}
