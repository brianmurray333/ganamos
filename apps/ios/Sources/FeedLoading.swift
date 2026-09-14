import Foundation
import UIKit

@MainActor
struct FeedSnapshotCache {
    static let shared = FeedSnapshotCache()
    static let freshnessInterval: TimeInterval = 5 * 60

    private struct Snapshot: Codable {
        let savedAt: Date
        let posts: [GanamosPost]
    }

    private let defaults: UserDefaults
    private let now: () -> Date
    private let keyPrefix: String

    init(
        defaults: UserDefaults = .standard,
        now: @escaping () -> Date = Date.init,
        keyPrefix: String = "ganamos.feed.snapshot.v1"
    ) {
        self.defaults = defaults
        self.now = now
        self.keyPrefix = keyPrefix
    }

    static func scope(userID: UUID?) -> String {
        userID.map { "account.\($0.uuidString.lowercased())" } ?? "anonymous"
    }

    func freshPosts(scope: String = "anonymous") -> [GanamosPost]? {
        let key = scopedKey(scope)
        guard let data = defaults.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) else {
            return nil
        }
        let age = now().timeIntervalSince(snapshot.savedAt)
        guard age >= 0, age <= Self.freshnessInterval else { return nil }
        return snapshot.posts
    }

    func save(_ posts: [GanamosPost], scope: String = "anonymous") {
        guard let data = try? JSONEncoder().encode(Snapshot(savedAt: now(), posts: posts)) else { return }
        defaults.set(data, forKey: scopedKey(scope))
    }

    private func scopedKey(_ scope: String) -> String {
        "\(keyPrefix).\(scope)"
    }
}

actor FeedImageStore {
    typealias Fetcher = @Sendable (URL) async throws -> Data

    static let shared = FeedImageStore(fetcher: liveFetcher)

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(
            memoryCapacity: 64 * 1_024 * 1_024,
            diskCapacity: 256 * 1_024 * 1_024,
            diskPath: "ganamos-feed-images"
        )
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.timeoutIntervalForRequest = 8
        return URLSession(configuration: configuration)
    }()

    private static let liveFetcher: Fetcher = { url in
        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode),
              UIImage(data: data) != nil else {
            throw URLError(.cannotDecodeContentData)
        }
        return data
    }

    private let fetcher: Fetcher
    private var cachedData: [URL: Data] = [:]
    private var cacheOrder: [URL] = []
    private var cachedByteCount = 0
    private let memoryLimit = 64 * 1_024 * 1_024
    private var inFlight: [URL: Task<Data, Error>] = [:]

    init(fetcher: @escaping Fetcher) {
        self.fetcher = fetcher
    }

    func data(for url: URL) async throws -> Data {
        if let cached = cachedData[url] { return cached }
        if let task = inFlight[url] { return try await task.value }

        let fetcher = self.fetcher
        let task = Task { try await fetcher(url) }
        inFlight[url] = task
        do {
            let data = try await task.value
            insert(data, for: url)
            inFlight[url] = nil
            return data
        } catch {
            inFlight[url] = nil
            throw error
        }
    }

    func prefetch(_ urls: [URL]) async {
        await withTaskGroup(of: Void.self) { group in
            for url in urls {
                group.addTask { [self] in
                    _ = try? await data(for: url)
                }
            }
        }
    }

    private func insert(_ data: Data, for url: URL) {
        if let previous = cachedData[url] {
            cachedByteCount -= previous.count
            cacheOrder.removeAll { $0 == url }
        }
        cachedData[url] = data
        cacheOrder.append(url)
        cachedByteCount += data.count

        while cachedByteCount > memoryLimit, let oldest = cacheOrder.first {
            cacheOrder.removeFirst()
            if let removed = cachedData.removeValue(forKey: oldest) {
                cachedByteCount -= removed.count
            }
        }
    }
}
