import Foundation
import XCTest
@testable import Ganamos

@MainActor
final class FeedLoadingTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testFreshSnapshotRestoresFeedImmediately() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.fresh"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.fresh")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let posts = try samplePosts()

        cache.save(posts)

        XCTAssertEqual(cache.freshPosts(), posts)
    }

    func testExpiredSnapshotDoesNotRestoreFeed() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.expired"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.expired")
        var currentTime = now
        let cache = FeedSnapshotCache(defaults: defaults, now: { currentTime })
        cache.save(try samplePosts())

        currentTime.addTimeInterval(5 * 60 + 1)

        XCTAssertNil(cache.freshPosts())
    }

    func testFeedModelRestoresFreshCachedPostsForActiveScope() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.model"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.model")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let posts = try samplePosts()
        cache.save(posts)

        let model = FeedModel(cache: cache)
        model.activateCacheScope("anonymous")

        XCTAssertEqual(model.posts, posts)
        XCTAssertFalse(model.isLoading)
    }

    func testSnapshotsAreIsolatedBetweenAccountsAndSignedOutFeed() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.accounts"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.accounts")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let firstAccountPosts = try samplePosts()
        let secondAccountPosts = Array(firstAccountPosts.reversed())
        let firstScope = FeedSnapshotCache.scope(
            userID: UUID(uuidString: "00000000-0000-0000-0000-000000000101")
        )
        let secondScope = FeedSnapshotCache.scope(
            userID: UUID(uuidString: "00000000-0000-0000-0000-000000000202")
        )

        cache.save(firstAccountPosts, scope: firstScope)

        XCTAssertEqual(cache.freshPosts(scope: firstScope), firstAccountPosts)
        XCTAssertNil(cache.freshPosts(scope: secondScope))
        XCTAssertNil(cache.freshPosts(scope: FeedSnapshotCache.scope(userID: nil)))

        cache.save(secondAccountPosts, scope: secondScope)
        let model = FeedModel(cache: cache)
        model.activateCacheScope(firstScope)
        XCTAssertEqual(model.posts, firstAccountPosts)
        model.activateCacheScope(secondScope)
        XCTAssertEqual(model.posts, secondAccountPosts)
        model.activateCacheScope(FeedSnapshotCache.scope(userID: nil))
        XCTAssertTrue(model.posts.isEmpty)
    }

    func testFeedWaitsForFirstScreenImagePrefetchBeforePublishingMetadata() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.prefetch"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.prefetch")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let posts = try samplePosts()
        var model: FeedModel!
        var prefetchedURLs: [URL] = []
        model = FeedModel(
            cache: cache,
            postsLoader: { _ in posts },
            imagePrefetcher: { urls in
                XCTAssertTrue(model.posts.isEmpty, "Metadata must not appear before first-screen photos are ready.")
                prefetchedURLs = urls
            }
        )

        await model.load(token: nil)

        XCTAssertEqual(prefetchedURLs, posts.compactMap(\.imageURL).prefix(3).map { $0 })
        XCTAssertEqual(model.posts, posts)
        XCTAssertFalse(model.isLoading)
    }

    func testFeedPublishesWhenImagePrefetchExceedsBudget() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.prefetch-timeout"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.prefetch-timeout")
        let posts = try samplePosts()
        let model = FeedModel(
            cache: FeedSnapshotCache(defaults: defaults, now: { self.now }),
            postsLoader: { _ in posts },
            imagePrefetcher: { _ in try? await Task.sleep(for: .milliseconds(500)) },
            imagePrefetchTimeout: .milliseconds(30)
        )
        let clock = ContinuousClock()
        let startedAt = clock.now

        await model.load(token: nil)

        XCTAssertLessThan(startedAt.duration(to: clock.now), .milliseconds(250))
        XCTAssertEqual(model.posts, posts)
        XCTAssertFalse(model.isLoading)
    }

    func testCancelledLoadCannotPublishOrPersistMetadata() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.cancelled"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.cancelled")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let posts = try samplePosts()
        let prefetchStarted = expectation(description: "Prefetch started")
        let prefetchCancelled = expectation(description: "Prefetch cancelled")
        let model = FeedModel(
            cache: cache,
            postsLoader: { _ in posts },
            imagePrefetcher: { _ in
                prefetchStarted.fulfill()
                do {
                    try await Task.sleep(for: .seconds(5))
                } catch {
                    prefetchCancelled.fulfill()
                }
            },
            imagePrefetchTimeout: .seconds(2)
        )
        let scope = "account.cancelled"

        let load = Task { await model.load(token: "session", cacheScope: scope) }
        await fulfillment(of: [prefetchStarted], timeout: 1)
        let clock = ContinuousClock()
        let cancelledAt = clock.now
        load.cancel()
        await load.value
        await fulfillment(of: [prefetchCancelled], timeout: 1)

        XCTAssertLessThan(cancelledAt.duration(to: clock.now), .milliseconds(250))
        XCTAssertTrue(model.posts.isEmpty)
        XCTAssertNil(cache.freshPosts(scope: scope))
        XCTAssertFalse(model.isLoading)
    }

    func testImageStoreDeduplicatesRepeatedRequests() async throws {
        let probe = ImageFetchProbe()
        let store = FeedImageStore { url in await probe.fetch(url) }
        let url = try XCTUnwrap(URL(string: "https://example.com/photo.jpg"))

        async let first = store.data(for: url)
        async let second = store.data(for: url)
        let (firstData, secondData) = try await (first, second)

        XCTAssertEqual(firstData, secondData)
        let fetchCount = await probe.count()
        XCTAssertEqual(fetchCount, 1)
    }

    func testOlderLoadCannotOverwriteNewerSessionResponse() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "FeedLoadingTests.generation"))
        defaults.removePersistentDomain(forName: "FeedLoadingTests.generation")
        let cache = FeedSnapshotCache(defaults: defaults, now: { self.now })
        let oldPosts = try samplePosts()
        let newPosts = Array(oldPosts.reversed())
        let oldRequestStarted = expectation(description: "Old request started")
        let model = FeedModel(
            cache: cache,
            postsLoader: { token in
                if token == "old" {
                    oldRequestStarted.fulfill()
                    try await Task.sleep(for: .milliseconds(120))
                    return oldPosts
                }
                return newPosts
            },
            imagePrefetcher: { _ in }
        )

        let oldLoad = Task { await model.load(token: "old") }
        await fulfillment(of: [oldRequestStarted], timeout: 1)
        await model.load(token: "new")
        await oldLoad.value

        XCTAssertEqual(model.posts, newPosts)
        XCTAssertFalse(model.isLoading)
    }

    private func samplePosts() throws -> [GanamosPost] {
        let objects: [[String: Any]] = (1...4).map { index in
            [
                "id": String(format: "00000000-0000-0000-0000-%012d", index),
                "title": "Cached fix \(index)",
                "description": "Cached description \(index)",
                "image_url": "https://example.com/photo-\(index).jpg",
                "location": "Mission",
                "latitude": 37.7,
                "longitude": -122.4,
                "reward": 500,
                "created_at": "2026-08-02T12:00:00Z",
                "fixed": false,
                "under_review": false,
            ]
        }
        let data = try JSONSerialization.data(withJSONObject: objects)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([GanamosPost].self, from: data)
    }
}

private actor ImageFetchProbe {
    private var fetchCount = 0

    func fetch(_ url: URL) -> Data {
        fetchCount += 1
        return Data(url.absoluteString.utf8)
    }

    func count() -> Int { fetchCount }
}
