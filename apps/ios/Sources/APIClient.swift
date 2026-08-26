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
            URLQueryItem(name: "select", value: "id,title,description,image_url,location,latitude,longitude,reward,created_at,user_id,fixed,under_review,deleted_at,group:group_id(id,name,description)"),
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
        imageURL: URL?,
        reward: Int,
        accessToken: String,
        userID: UUID,
        profile: UserProfile?
    ) async throws -> CreatePostResult {
        guard let baseURL = configuration.supabaseURL else { throw APIError.notConfigured }
        var request = authorizedRequest(url: baseURL.appending(path: "rest/v1/rpc/create_post_atomic"), accessToken: accessToken)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var payload: [String: Any] = [
            "p_post_id": UUID().uuidString.lowercased(),
            "p_user_id": userID.uuidString.lowercased(),
            "p_created_by": profile?.name ?? profile?.email ?? "Ganamos member",
            "p_title": title,
            "p_description": description,
            "p_has_image": imageURL != nil,
            "p_reward": reward,
            "p_memo": "Post reward for: \(String(description.prefix(50)))"
        ]
        if let avatar = profile?.avatarURL { payload["p_created_by_avatar"] = avatar.absoluteString }
        if let imageURL { payload["p_image_url"] = imageURL.absoluteString }
        if let location, !location.isEmpty { payload["p_location"] = location }
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

    func bitcoinPrice() async throws -> Double {
        let response = try await decode(URLRequest(url: URL(string: "https://ganamos.earth/api/bitcoin-price")!), as: BitcoinPriceResponse.self)
        return response.price
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
