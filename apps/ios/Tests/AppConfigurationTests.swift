import CoreImage
import SwiftUI
import UIKit
import XCTest
@testable import Ganamos

final class AppConfigurationTests: XCTestCase {
    func testProductionFallbackUsesHTTPS() {
        XCTAssertEqual(AppConfiguration.current.apiBaseURL.scheme, "https")
    }

    func testHomeBalanceUsesTransparentBadgeStyle() throws {
        let feedSource = try source(named: "FeedView.swift")

        XCTAssertTrue(
            feedSource.contains("SatsBadge(amount: session.profile?.balance ?? 0, style: .transparent)"),
            "The Home balance control should keep its content and touch target without a filled badge background."
        )
    }

    func testRootDoesNotBlockTabsBehindSessionRestoreSpinner() throws {
        let rootSource = try source(named: "RootView.swift")

        XCTAssertFalse(rootSource.contains("hasRestoredSession"))
        XCTAssertFalse(rootSource.contains("accessibilityLabel(\"Restoring your session\")"))
    }

    func testLaunchScreenUsesDarkCanvasColor() throws {
        let launchScreen = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "UILaunchScreen") as? [String: Any])
        XCTAssertEqual(launchScreen["UIColorName"] as? String, "LaunchBackground")
        XCTAssertNotNil(UIColor(named: "LaunchBackground"))
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "UIStatusBarStyle") as? String, "UIStatusBarStyleLightContent")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "UIUserInterfaceStyle") as? String, "Dark")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "UIViewControllerBasedStatusBarAppearance") as? Bool, false)
    }

    func testCameraAndPhotoLibraryTransitionsResetReusableState() throws {
        let source = try source(named: "NewFixView.swift")
        let disappearance = try XCTUnwrap(source.range(of: "override func viewWillDisappear"))
        let configureCamera = try XCTUnwrap(source.range(of: "private func configureCamera", range: disappearance.lowerBound..<source.endIndex))
        let disappearanceBody = String(source[disappearance.lowerBound..<configureCamera.lowerBound])
        XCTAssertTrue(disappearanceBody.contains("activeCaptureID = nil"))
        XCTAssertTrue(disappearanceBody.contains("didCapture = false"))

        let selectionChange = try XCTUnwrap(source.range(of: ".onChange(of: photoItem)"))
        let destination = try XCTUnwrap(source.range(of: ".navigationDestination", range: selectionChange.lowerBound..<source.endIndex))
        let selectionBody = String(source[selectionChange.lowerBound..<destination.lowerBound])
        XCTAssertTrue(selectionBody.contains("photoItem = nil"))
        XCTAssertTrue(selectionBody.contains("UIImage(data: data) != nil"))
    }

    func testHomeTopBarFadesIntoFeedInsteadOfUsingHardBackground() throws {
        let feedSource = try source(named: "FeedView.swift")

        let color = UIColor(HomeTopBarFadeStyle.background)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        XCTAssertEqual(red, 2.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(green, 8.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(blue, 23.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(alpha, 1, accuracy: 0.001)

        XCTAssertTrue(feedSource.contains(".toolbarBackground(HomeTopBarFadeStyle.gradient, for: .navigationBar)"))
        XCTAssertTrue(feedSource.contains(".toolbarBackground(.visible, for: .navigationBar)"))
        XCTAssertFalse(feedSource.contains("private struct HomeTopBarFade"))
    }

    func testReceiveScreenUsesNativeInvoiceFlowInsteadOfWebLoginHandoff() throws {
        let source = try source(named: "WalletFlowViews.swift")
        let receiveStart = try XCTUnwrap(source.range(of: "struct WalletReceiveView"))
        let sendStart = try XCTUnwrap(source.range(of: "struct WalletSendView", range: receiveStart.lowerBound..<source.endIndex))
        let receiveSource = String(source[receiveStart.lowerBound..<sendStart.lowerBound])

        XCTAssertFalse(receiveSource.contains("WebDestination"))
        XCTAssertFalse(receiveSource.contains("/wallet/deposit"))
        XCTAssertTrue(receiveSource.contains("createDepositInvoice"))
        XCTAssertTrue(receiveSource.contains("walletInvoiceQRCode"))
    }

    func testDepositInvoiceRequestUsesNativeBearerAuthentication() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DepositInvoiceURLProtocol.self]
        let client = APIClient(
            configuration: AppConfiguration(
                apiBaseURL: URL(string: "https://example.com")!,
                supabaseURL: URL(string: "https://supabase.example.com")!,
                supabaseAnonKey: "anon-key"),
            session: URLSession(configuration: configuration))
        let userID = UUID(uuidString: "00000000-0000-4000-8000-000000000123")!

        let invoice = try await client.createDepositInvoice(
            amount: 2_500,
            userID: userID,
            requestID: UUID(uuidString: "00000000-0000-4000-8000-000000000124")!,
            accessToken: "native-access-token")

        XCTAssertEqual(invoice.paymentRequest, "lnbc2500n1testinvoice")
        XCTAssertEqual(invoice.invoiceID, "00000000-0000-4000-8000-000000000010")
        XCTAssertEqual(invoice.amount, 2_500)
    }

    func testDepositStatusUsesAuthenticatedInvoiceIdentifier() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DepositInvoiceURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let client = APIClient(
            configuration: AppConfiguration(
                apiBaseURL: URL(string: "https://example.com")!,
                supabaseURL: URL(string: "https://supabase.example.com")!,
                supabaseAnonKey: "anon-key"),
            session: session)

        let status = try await client.depositStatus(
            invoiceID: "00000000-0000-4000-8000-000000000010",
            accessToken: "native-access-token")

        XCTAssertTrue(status.settled)
        XCTAssertEqual(status.status, "completed")
        XCTAssertEqual(status.newBalance, 7_500)
    }

    func testDepositInvoiceExpiryAcceptsServerISO8601Formats() {
        XCTAssertNotNil(depositInvoiceExpirationDate("2026-09-14T18:00:00.123Z"))
        XCTAssertNotNil(depositInvoiceExpirationDate("2026-09-14T18:00:00Z"))
        XCTAssertNil(depositInvoiceExpirationDate("not-a-date"))
    }

    func testLightningQRCodeFailsClosedAndRoundTripsInvoice() throws {
        XCTAssertNil(lightningQRCode(for: ""))
        let invoice = "lnbc2500n1testinvoice"
        let image = try XCTUnwrap(lightningQRCode(for: invoice))
        let detector = try XCTUnwrap(CIDetector(ofType: CIDetectorTypeQRCode, context: nil))
        let features = detector.features(in: try XCTUnwrap(CIImage(image: image)))
        let qr = try XCTUnwrap(features.first as? CIQRCodeFeature)
        XCTAssertEqual(qr.messageString, invoice.uppercased())
    }

    func testDepositRecoveryStorePersistsIdempotencyAndInvoiceSecurely() throws {
        let ownerID = UUID(uuidString: "00000000-0000-4000-8000-000000000125")!
        defer {
            DepositRecoveryStore.clearPending(ownerID: ownerID)
            DepositRecoveryStore.clearInvoice(ownerID: ownerID)
        }
        let request = PendingDepositRequest(
            requestID: UUID(uuidString: "00000000-0000-4000-8000-000000000126")!,
            ownerID: ownerID,
            amount: 2_500,
            createdAt: Date())
        try DepositRecoveryStore.save(request)
        XCTAssertEqual(DepositRecoveryStore.pending(ownerID: ownerID)?.requestID, request.requestID)

        let invoice = DepositInvoice(
            success: true,
            invoiceID: "00000000-0000-4000-8000-000000000010",
            paymentRequest: "lnbc2500n1recoveryfixture",
            amount: 2_500,
            expiresAt: "2026-09-14T19:00:00.000Z")
        try DepositRecoveryStore.save(StoredDepositInvoice(ownerID: ownerID, invoice: invoice))
        XCTAssertEqual(DepositRecoveryStore.invoice(ownerID: ownerID)?.invoice.invoiceID, invoice.invoiceID)
    }

    @MainActor
    func testNativeReceiveInvoiceRendersDeterministically() throws {
        let ownerID = UUID(uuidString: "00000000-0000-4000-8000-000000000123")!
        let invoice = DepositInvoice(
            success: true,
            invoiceID: "00000000-0000-4000-8000-000000000010",
            paymentRequest: "lnbc2500n1testinvoicefixtureforvisualverification",
            amount: 2_500,
            expiresAt: "2026-09-14T19:00:00.000Z")
        let view = WalletReceiveView(
            initialInvoice: invoice,
            initialOwnerID: ownerID,
            monitoringEnabled: false)
            .environment(SessionStore())
        let bounds = CGRect(x: 0, y: 0, width: 393, height: 852)
        let host = UIHostingController(rootView: view)
        let window = UIWindow(frame: bounds)
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        let image = UIGraphicsImageRenderer(bounds: bounds).image { _ in
            XCTAssertTrue(host.view.drawHierarchy(in: bounds, afterScreenUpdates: true))
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Native Receive Invoice"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func source(named filename: String) throws -> String {
        let testsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        return try String(
            contentsOf: testsDirectory
                .deletingLastPathComponent()
                .appendingPathComponent("Sources/\(filename)"),
            encoding: .utf8)
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

    private static func readAll(_ stream: InputStream) -> Data? {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count >= 0 else { return nil }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override func stopLoading() {}
}

private final class DepositInvoiceURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        XCTAssertEqual(request.url?.path, "/api/mobile/wallet/deposit")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer native-access-token")

        if request.httpMethod == "GET" {
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
            XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "invoiceId" })?.value,
                           "00000000-0000-4000-8000-000000000010")
            respond(statusCode: 200, body: #"{"success":true,"status":"completed","settled":true,"amount":2500,"newBalance":7500}"#)
            return
        }

        XCTAssertEqual(request.httpMethod, "POST")
        let bodyData = request.httpBody ?? request.httpBodyStream.flatMap(Self.readAll)
        let payload = try? JSONSerialization.jsonObject(with: bodyData ?? Data()) as? [String: Any]
        XCTAssertEqual(payload?["amount"] as? Int, 2_500)
        XCTAssertEqual(payload?["userId"] as? String, "00000000-0000-4000-8000-000000000123")
        XCTAssertEqual(payload?["requestId"] as? String, "00000000-0000-4000-8000-000000000124")
        respond(
            statusCode: 201,
            body: #"{"success":true,"invoiceId":"00000000-0000-4000-8000-000000000010","paymentRequest":"lnbc2500n1testinvoice","paymentHash":"abc123","amount":2500,"expiresAt":"2026-09-14T18:00:00.123Z"}"#)
    }

    private func respond(statusCode: Int, body: String) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func readAll(_ stream: InputStream) -> Data? {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count >= 0 else { return nil }
            if count == 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override func stopLoading() {}
}
