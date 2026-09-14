import PhotosUI
import MapKit
import SwiftUI
import UIKit

private actor FeedPrefetchCompletionGate {
    private var isFinished = false
    private var waiter: CheckedContinuation<Void, Never>?

    func wait() async {
        guard !isFinished else { return }
        await withCheckedContinuation { continuation in
            guard !isFinished else {
                continuation.resume()
                return
            }
            waiter = continuation
        }
    }

    func finish() {
        guard !isFinished else { return }
        isFinished = true
        waiter?.resume()
        waiter = nil
    }
}

@MainActor @Observable
final class FeedModel {
    var posts: [GanamosPost] = []
    var isLoading = false
    var error: String?
    private let cache: FeedSnapshotCache
    private let postsLoader: (String?) async throws -> [GanamosPost]
    private let imagePrefetcher: ([URL]) async -> Void
    private let imagePrefetchTimeout: Duration
    private var loadGeneration = 0
    private var activeCacheScope: String?

    init(
        posts: [GanamosPost]? = nil,
        isLoading: Bool = false,
        error: String? = nil,
        cache: FeedSnapshotCache = .shared
    ) {
        self.cache = cache
        postsLoader = { try await APIClient.shared.posts(accessToken: $0) }
        imagePrefetcher = { await FeedImageStore.shared.prefetch($0) }
        imagePrefetchTimeout = .seconds(2)
        self.posts = posts ?? []
        self.isLoading = isLoading
        self.error = error
    }

    init(
        posts: [GanamosPost]? = nil,
        isLoading: Bool = false,
        error: String? = nil,
        cache: FeedSnapshotCache = .shared,
        postsLoader: @escaping (String?) async throws -> [GanamosPost],
        imagePrefetcher: @escaping ([URL]) async -> Void,
        imagePrefetchTimeout: Duration = .seconds(2)
    ) {
        self.cache = cache
        self.postsLoader = postsLoader
        self.imagePrefetcher = imagePrefetcher
        self.imagePrefetchTimeout = imagePrefetchTimeout
        self.posts = posts ?? []
        self.isLoading = isLoading
        self.error = error
    }

    func activateCacheScope(_ scope: String) {
        guard activeCacheScope != scope else { return }
        loadGeneration += 1
        activeCacheScope = scope
        posts = cache.freshPosts(scope: scope) ?? []
        error = nil
        isLoading = posts.isEmpty
    }

    func load(token: String?, cacheScope: String = "anonymous") async {
        if activeCacheScope != cacheScope {
            activateCacheScope(cacheScope)
        }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        error = nil
        do {
            let refreshedPosts = try await postsLoader(token)
            guard !Task.isCancelled else {
                if generation == loadGeneration { isLoading = false }
                return
            }
            var seenImageURLs = Set<URL>()
            let firstScreenImages = refreshedPosts.prefix(3).compactMap(\.imageURL).filter {
                seenImageURLs.insert($0).inserted
            }
            await prefetchWithinPublicationBudget(firstScreenImages)
            guard !Task.isCancelled, generation == loadGeneration else {
                if generation == loadGeneration { isLoading = false }
                return
            }
            posts = refreshedPosts
            cache.save(refreshedPosts, scope: cacheScope)
            isLoading = false
        } catch is CancellationError {
            guard generation == loadGeneration else { return }
            isLoading = false
        } catch APIError.sessionExpired {
            guard generation == loadGeneration else { return }
            error = nil
            isLoading = false
        } catch {
            guard generation == loadGeneration else { return }
            self.error = error.localizedDescription
            isLoading = false
        }
    }

    private func prefetchWithinPublicationBudget(_ urls: [URL]) async {
        guard !urls.isEmpty else { return }
        let prefetcher = imagePrefetcher
        let timeout = imagePrefetchTimeout
        let completion = FeedPrefetchCompletionGate()
        let prefetchTask = Task {
            await prefetcher(urls)
            await completion.finish()
        }
        let timeoutTask = Task {
            try? await Task.sleep(for: timeout)
            guard !Task.isCancelled else { return }
            await completion.finish()
        }
        await withTaskCancellationHandler {
            await completion.wait()
        } onCancel: {
            prefetchTask.cancel()
            timeoutTask.cancel()
            Task { await completion.finish() }
        }
        timeoutTask.cancel()
        if Task.isCancelled { prefetchTask.cancel() }
    }
}

struct FeedView: View {
    @Environment(SessionStore.self) private var session
    @State private var model: FeedModel
    private let disablesAutomaticLoad: Bool
    @State private var searchText = ""
    @State private var maximumReward = 10_000.0
    @State private var dateFilter: FeedDateFilter = .any
    @State private var isShowingFilters = false
    @State private var isShowingWallet = false
    @State private var selectedPost: GanamosPost?

    init() {
        let model = FeedModel()
        let persistedUserID = (
            UserDefaults.standard.string(forKey: "activeUserID")
                ?? UserDefaults.standard.string(forKey: "sessionUserID")
        )
            .flatMap(UUID.init(uuidString:))
        model.activateCacheScope(FeedSnapshotCache.scope(userID: persistedUserID))
        _model = State(initialValue: model)
        disablesAutomaticLoad = false
    }

#if DEBUG
    init(regressionState: FeedRegressionState) {
        switch regressionState {
        case .loading: _model = State(initialValue: FeedModel(posts: [], isLoading: true))
        case .error: _model = State(initialValue: FeedModel(posts: [], error: "Check your connection and try again."))
        case .empty: _model = State(initialValue: FeedModel(posts: []))
        case .loaded(let posts): _model = State(initialValue: FeedModel(posts: posts))
        }
        disablesAutomaticLoad = true
    }
#endif

    private var filteredPosts: [GanamosPost] {
        model.posts.filter { post in
            let matchesText = searchText.isEmpty
                || (post.title ?? "").localizedCaseInsensitiveContains(searchText)
                || post.description.localizedCaseInsensitiveContains(searchText)
                || (post.location ?? "").localizedCaseInsensitiveContains(searchText)
            let matchesReward = post.reward <= Int(maximumReward)
            let matchesDate: Bool
            switch dateFilter {
            case .any: matchesDate = true
            case .today: matchesDate = post.createdAt.map(Calendar.current.isDateInToday) ?? false
            case .week:
                matchesDate = post.createdAt.map { $0 >= Calendar.current.date(byAdding: .day, value: -7, to: Date())! } ?? false
            }
            return matchesText && matchesReward && matchesDate
        }
    }

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            if model.isLoading && model.posts.isEmpty { FeedSkeleton() }
            else if let error = model.error, model.posts.isEmpty {
                EmptyState(icon: "wifi.exclamationmark", title: "Couldn’t load fixes", message: error)
            } else if filteredPosts.isEmpty {
                EmptyState(icon: "wrench.and.screwdriver", title: "No open fixes", message: "Try another search or check back soon.")
            } else {
                ScrollView {
                    LazyVStack(spacing: 26) {
                        ForEach(filteredPosts) { post in
                            Button {
                                selectedPost = post
                            } label: {
                                PostCard(post: post)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("feedPost-\(post.id.uuidString.lowercased())")
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .refreshable { await model.load(token: session.accessToken, cacheScope: cacheScope) }
            }

        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(HomeTopBarFadeStyle.gradient, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .navigationDestination(item: $selectedPost) { post in
            PostDetailView(post: post)
        }
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search fixes")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { isShowingFilters = true } label: {
                    Image(systemName: activeFilterCount == 0 ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                        .foregroundStyle(activeFilterCount == 0 ? .white : GanamosColor.green)
                }
                .accessibilityLabel("Filters")
                .accessibilityValue(activeFilterCount == 0 ? "None active" : "\(activeFilterCount) active")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if session.isAuthenticated {
                    AccountBalanceMenu(isShowingWallet: $isShowingWallet)
                }
                else { Button("Sign In") { session.isPresentingLogin = true } }
            }
        }
        .task {
            guard !disablesAutomaticLoad else { return }
            model.activateCacheScope(cacheScope)
            await model.load(token: session.accessToken, cacheScope: cacheScope)
        }
        .onChange(of: session.userID) { _, _ in
            guard !disablesAutomaticLoad else { return }
            Task {
                model.activateCacheScope(cacheScope)
                await model.load(token: session.accessToken, cacheScope: cacheScope)
            }
        }
        .onChange(of: session.accessToken) { previousToken, refreshedToken in
            guard !disablesAutomaticLoad,
                  previousToken != nil,
                  previousToken != refreshedToken,
                  refreshedToken != nil else { return }
            Task { await model.load(token: refreshedToken, cacheScope: cacheScope) }
        }
        .sheet(isPresented: $isShowingFilters) {
            FeedFilterSheet(maximumReward: $maximumReward, dateFilter: $dateFilter)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isShowingWallet) { NavigationStack { WalletView() } }
        .preferredColorScheme(.dark)
    }

    private var activeFilterCount: Int { (maximumReward < 10_000 ? 1 : 0) + (dateFilter == .any ? 0 : 1) }

    private var cacheScope: String {
        FeedSnapshotCache.scope(userID: session.userID)
    }
}

struct HomeTopBarFadeStyle {
    static let background = GanamosColor.canvas
    static var gradient: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: background, location: 0),
                .init(color: background, location: 0.5),
                .init(color: .clear, location: 1)
            ],
            startPoint: .top,
            endPoint: .bottom)
    }
}

private struct AccountBalanceMenu: View {
    @Environment(SessionStore.self) private var session
    @Binding var isShowingWallet: Bool

    var body: some View {
        Menu {
            Section("Current balance") {
                Button {
                    isShowingWallet = true
                } label: {
                    Label("View Wallet", systemImage: "wallet.pass")
                }
            }

            Section(session.connectedAccounts.isEmpty ? "Account" : "Switch account") {
                    accountButton(
                        session.mainProfile,
                        fallbackName: "Main Account",
                        isSelected: !session.isConnectedAccount) {
                            session.resetToMainAccount()
                        }

                    ForEach(session.connectedAccounts) { account in
                        accountButton(
                            account,
                            fallbackName: "Child",
                            isSelected: session.activeUserID == account.id) {
                                session.switchToAccount(account)
                            }
                    }
            }
        } label: {
            SatsBadge(amount: session.profile?.balance ?? 0, style: .transparent)
        }
        .accessibilityLabel(Text(verbatim: accountMenuAccessibilityLabel))
        .accessibilityIdentifier("homeAccountMenu")
    }

    private var accountMenuAccessibilityLabel: String {
        "Account menu, balance \((session.profile?.balance ?? 0).formatted()) sats"
    }

    @ViewBuilder
    private func accountButton(
        _ account: UserProfile?,
        fallbackName: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        if let account {
            Button(action: action) {
                Label(
                    account.name?.nilIfBlank ?? fallbackName,
                    systemImage: isSelected ? "checkmark.circle.fill" : "person.crop.circle")
            }
            .accessibilityValue(isSelected ? "Selected" : "")
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

#if DEBUG
enum FeedRegressionState { case loading, error, empty, loaded([GanamosPost]) }
#endif

private enum FeedDateFilter: String, CaseIterable, Identifiable {
    case any = "Any Time"
    case today = "Today"
    case week = "This Week"
    var id: Self { self }
}

private struct FeedFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var maximumReward: Double
    @Binding var dateFilter: FeedDateFilter

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 13) {
                    HStack {
                        Text("Maximum reward").font(.headline)
                        Spacer()
                        Text("\(Int(maximumReward).formatted()) sats").foregroundStyle(GanamosColor.green)
                    }
                    Slider(value: $maximumReward, in: 0...10_000, step: 500).tint(GanamosColor.green)
                    HStack { Text("0"); Spacer(); Text("10,000 sats") }
                        .font(.caption).foregroundStyle(GanamosColor.mutedText)
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("Date").font(.headline)
                    Picker("Date", selection: $dateFilter) {
                        ForEach(FeedDateFilter.allCases) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented)
                }
                Spacer()
                Button("Show results") { dismiss() }
                    .font(.headline).foregroundStyle(.black)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .padding(22)
            .background(GanamosColor.canvas.ignoresSafeArea())
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") { maximumReward = 10_000; dateFilter = .any }
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }.preferredColorScheme(.dark)
    }
}

private struct PostCard: View {
    let post: GanamosPost

    private var displayTitle: String { post.title?.isEmpty == false ? post.title! : post.description }

    var body: some View {
        VStack(spacing: 0) {
            FeedCardImage(url: post.imageURL)
            .frame(maxWidth: .infinity)
            .frame(height: 201)
            .clipped()

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(displayTitle)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    if let location = post.location, !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                            .foregroundStyle(GanamosColor.mutedText)
                            .lineLimit(1)
                    }

                    HStack(spacing: 6) {
                        if let group = post.group { Text(group.name) }
                        if post.group != nil, post.createdAt != nil { Text("•") }
                        if let createdAt = post.createdAt { Text(createdAt, style: .relative).textCase(.lowercase) }
                    }
                    .font(.caption)
                    .foregroundStyle(GanamosColor.mutedText)
                }
                Spacer(minLength: 4)
                RewardBadge(amount: post.reward)
                    .offset(y: -4)
            }
            .padding(.leading, 16)
            .padding(.trailing, 10)
            .padding(.vertical, 15)
        }
        .background(GanamosColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(GanamosColor.border, lineWidth: 1))
        .shadow(color: .black.opacity(0.24), radius: 12, y: 7)
        .accessibilityElement(children: .combine)
    }
}

private struct FeedCardImage: View {
    let url: URL?
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            GanamosColor.green.opacity(0.12)
            Image(systemName: "wrench.and.screwdriver")
                .foregroundStyle(GanamosColor.green)

            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            }
        }
        .task(id: url) {
            image = nil
            guard let url,
                  let data = try? await FeedImageStore.shared.data(for: url),
                  !Task.isCancelled,
                  let loadedImage = UIImage(data: data) else { return }
            withAnimation(.easeOut(duration: 0.22)) {
                image = loadedImage
            }
        }
    }
}

private struct FeedSkeleton: View {
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 26) {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(spacing: 0) {
                        GanamosColor.surface.opacity(0.75).aspectRatio(16 / 9, contentMode: .fit)
                        RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.08)).frame(height: 76).padding(16)
                    }
                    .background(GanamosColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .redacted(reason: .placeholder)
        .accessibilityIdentifier("feedLoadingState")
    }
}

struct PostDetailView: View {
    private enum ActionSheet: String, Identifiable {
        case reject, close
        var id: String { rawValue }
    }

    let post: GanamosPost
    private let regressionTreatAsOwner: Bool
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var webDestination: WebDestination?
    @State private var isPresentingFix = false
    @State private var isGroupAdmin = false
    @State private var deadline: Date?
    @State private var isConfirmingApproval = false
    @State private var actionSheet: ActionSheet?
    @State private var isReviewing = false
    @State private var reviewError: String?

    init(post: GanamosPost, regressionTreatAsOwner: Bool = false) {
        self.post = post
        self.regressionTreatAsOwner = regressionTreatAsOwner
    }

    private var displayTitle: String {
        post.title?.isEmpty == false ? post.title! : "Community fix"
    }

    private var isOpen: Bool {
        post.fixed != true && post.underReview != true && post.deletedAt == nil
    }

    private var canMarkComplete: Bool {
        isOpen && (isIssueOwner || isGroupAdmin)
    }

    private var isIssueOwner: Bool {
        regressionTreatAsOwner || (session.userID != nil && post.userID == session.userID)
    }

    private var statusLabel: String {
        if post.fixed == true { return "Fixed" }
        if post.underReview == true { return "Under review" }
        return "Open"
    }

    private var statusColor: Color {
        if post.fixed == true { return GanamosColor.green }
        if post.underReview == true { return .orange }
        return .blue
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            GanamosColor.surface.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    AsyncImage(url: post.imageURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        ZStack {
                            GanamosColor.green.opacity(0.1)
                            Image(systemName: "photo").font(.largeTitle).foregroundStyle(GanamosColor.green)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 390)
                    .clipped()

                    VStack(alignment: .leading, spacing: 18) {
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 9) {
                                Text(displayTitle)
                                    .font(.system(size: 29, weight: .bold))
                                    .foregroundStyle(.white)
                                    .fixedSize(horizontal: false, vertical: true)

                                HStack(spacing: 8) {
                                    Circle().fill(statusColor).frame(width: 7, height: 7)
                                    Text(statusLabel)
                                    if let createdAt = post.createdAt {
                                        Text(createdAt, style: .relative).textCase(.lowercase)
                                    }
                                }
                                .font(.subheadline)
                                .foregroundStyle(GanamosColor.mutedText)


                            }
                            Spacer(minLength: 4)
                            RewardBadge(amount: post.reward)
                        }

                        if post.description != displayTitle {
                            Text(post.description)
                                .font(.body)
                                .foregroundStyle(.white.opacity(0.9))
                        }

                        if let latitude = post.latitude, let longitude = post.longitude {
                            PostLocationMap(
                                latitude: latitude,
                                longitude: longitude,
                                location: post.location
                            )
                        } else if let location = post.location, !location.isEmpty {
                            Label(location, systemImage: "mappin.and.ellipse")
                                .font(.subheadline)
                                .foregroundStyle(GanamosColor.mutedText)
                        }

                        if post.underReview == true {
                            reviewCard
                        }

                        if isOpen && !isIssueOwner && !isGroupAdmin {
                            Button {
                                if session.isAuthenticated { isPresentingFix = true }
                                else { session.isPresentingLogin = true }
                            } label: {
                                Text("Start")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.white)
                            .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }

                        // Deadline control directly above Mark Complete
                        if isIssueOwner {
                            Menu {
                                Button("In 1 hour") { deadline = Date().addingTimeInterval(3600); Task { await setDeadline() } }
                                Button("In 12 hours") { deadline = Date().addingTimeInterval(12 * 3600); Task { await setDeadline() } }
                                Button("In 1 day") { deadline = Date().addingTimeInterval(24 * 3600); Task { await setDeadline() } }
                                Button("In 3 days") { deadline = Date().addingTimeInterval(72 * 3600); Task { await setDeadline() } }
                                Button("In 7 days") { deadline = Date().addingTimeInterval(168 * 3600); Task { await setDeadline() } }
                                if deadline != nil { Button("Remove deadline", role: .destructive) { deadline = nil; Task { await setDeadline() } } }
                            } label: {
                                Text(deadline.map { "Expires " + $0.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)) } ?? "Add deadline")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                                    .foregroundStyle(.white)
                                    .background(GanamosColor.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(GanamosColor.border))
                            }
                        } else if let deadline {
                            Text("Expires " + deadline.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)))
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .frame(height: 52)
                                .foregroundStyle(.white)
                                .background(GanamosColor.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(GanamosColor.border))
                        }

                        if canMarkComplete {
                            Button {
                                actionSheet = .close
                            } label: {
                                Text("Mark Complete")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.white)
                            .background(GanamosColor.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(GanamosColor.border))
                            .accessibilityHint("Choose the registered fixer and release the reward")
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 22)
                    .padding(.bottom, 32)
                }
            }
            .ignoresSafeArea(edges: .top)

            HStack {
                Button { dismiss() } label: {
                    detailControlIcon("chevron.left")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")

                Spacer()

                ShareLink(item: URL(string: "https://ganamos.earth/post/\(post.id.uuidString.lowercased())")!) {
                    detailControlIcon("square.and.arrow.up")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Share issue")
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $isPresentingFix) { NavigationStack { SubmitFixView(post: post) } }
        .sheet(item: $webDestination) { destination in NativeWebSheet(url: destination.url).ignoresSafeArea() }
        .sheet(item: $actionSheet) { destination in
            switch destination {
            case .reject:
                RejectFixSheet { reason in Task { await reviewFix(approve: false, reason: reason) } }
            case .close:
                CloseIssueSheet(reward: post.reward) { username in Task { await closeIssue(fixerUsername: username) } }
            }
        }
        .confirmationDialog("Approve this fix and release \(post.reward.formatted()) sats?", isPresented: $isConfirmingApproval, titleVisibility: .visible) {
            Button("Approve and release reward") { Task { await reviewFix(approve: true) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action credits the fixer and cannot be undone.")
        }
        .alert("Couldn’t review fix", isPresented: Binding(
            get: { reviewError != nil },
            set: { if !$0 { reviewError = nil } }
        )) { Button("OK") {} } message: { Text(reviewError ?? "Please try again.") }
        .task(id: session.userID) {
            await loadGroupAdminStatus()
            deadline = post.expiresAt
        }
        .preferredColorScheme(.dark)
    }

    private func detailControlIcon(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 21, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(.ultraThinMaterial, in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.16), lineWidth: 1))
            .contentShape(Circle())
    }

    private var reviewCard: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 11) {
                AsyncImage(url: post.submittedFixByAvatar) { $0.resizable().scaledToFill() } placeholder: {
                    Circle().fill(GanamosColor.border).overlay(Image(systemName: "person.fill"))
                }
                .frame(width: 42, height: 42)
                .clipShape(Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Fix submitted").font(.headline)
                    Text("by \(post.submittedFixByName ?? "a community member")")
                        .font(.subheadline).foregroundStyle(GanamosColor.mutedText)
                }
            }
            if let proof = post.submittedFixProofText, !proof.isEmpty {
                Text(proof).font(.body).foregroundStyle(.white.opacity(0.9))
            }
            if let note = post.submittedFixNote, !note.isEmpty {
                Text(note).font(.subheadline).foregroundStyle(GanamosColor.mutedText)
            }
            if let imageURL = post.submittedFixImageURL {
                AsyncImage(url: imageURL) { $0.resizable().scaledToFill() } placeholder: { ProgressView() }
                    .frame(maxWidth: .infinity).frame(height: 190).clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if isIssueOwner || isGroupAdmin {
                if post.submittedFixByID != nil {
                    HStack(spacing: 10) {
                        Button("Reject", role: .destructive) { actionSheet = .reject }
                            .buttonStyle(.bordered).frame(maxWidth: .infinity)
                        Button { isConfirmingApproval = true } label: {
                            Label("Approve", systemImage: "checkmark.shield.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent).tint(GanamosColor.green)
                    }
                    .disabled(isReviewing)
                    if isReviewing { ProgressView("Updating issue…").tint(GanamosColor.green) }
                } else {
                    Button {
                        webDestination = WebDestination(url: URL(string: "https://ganamos.earth/post/\(post.id.uuidString.lowercased())")!)
                    } label: {
                        Label("Review Lightning payout", systemImage: "bolt.shield.fill")
                            .font(.headline).frame(maxWidth: .infinity).frame(height: 48)
                    }
                    .buttonStyle(.borderedProminent).tint(GanamosColor.green)
                    .accessibilityHint("Opens the protected anonymous payout flow")
                }
            } else {
                Label("Waiting for owner approval", systemImage: "clock")
                    .font(.subheadline.weight(.medium)).foregroundStyle(.orange)
            }
        }
        .padding(16)
        .background(GanamosColor.canvas, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.orange.opacity(0.45)))
    }

    private func reviewFix(approve: Bool, reason: String? = nil) async {
        guard let token = session.accessToken else { return }
        actionSheet = nil
        isReviewing = true
        defer { isReviewing = false }
        do {
            _ = try await APIClient.shared.reviewFix(postID: post.id, approve: approve, rejectionReason: reason, accessToken: token)
            try? await session.refreshProfile()
            dismiss()
        } catch { reviewError = error.localizedDescription }
    }

    private func closeIssue(fixerUsername: String) async {
        guard let token = session.accessToken else { return }
        actionSheet = nil
        isReviewing = true
        defer { isReviewing = false }
        do {
            _ = try await APIClient.shared.closeIssue(postID: post.id, fixerUsername: fixerUsername, accessToken: token)
            try? await session.refreshProfile()
            dismiss()
        } catch { reviewError = error.localizedDescription }
    }

    private func loadGroupAdminStatus() async {
        guard post.userID != session.userID,
              let groupID = post.group?.id,
              let token = session.accessToken,
              let userID = session.userID else {
            isGroupAdmin = false
            return
        }
        isGroupAdmin = (try? await APIClient.shared.isGroupAdmin(groupID: groupID, accessToken: token, userID: userID)) ?? false
    }

    private func setDeadline() async {
        guard let token = session.accessToken else { return }
        try? await APIClient.shared.updatePostExpiration(postID: post.id, expiresAt: deadline, accessToken: token)
    }
}

private struct PostLocationMap: View {
    let latitude: Double
    let longitude: Double
    let location: String?

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var body: some View {
        Map(initialPosition: .region(MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.035, longitudeDelta: 0.035)
        ))) {
            Marker(location ?? "Issue", coordinate: coordinate)
                .tint(.orange)
        }
        .mapStyle(.standard(pointsOfInterest: .all, showsTraffic: false))
        .allowsHitTesting(false)
        .frame(height: 176)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(alignment: .topLeading) {
            if let location, !location.isEmpty {
                HStack(spacing: 7) {
                    Circle().fill(.orange).frame(width: 8, height: 8)
                    Text(location).lineLimit(1)
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 13)
                .padding(.vertical, 9)
                .background(.black.opacity(0.68), in: Capsule())
                .padding(12)
            }
        }
        .accessibilityLabel("Map showing \(location ?? "issue location")")
    }
}

private struct RejectFixSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    let reject: (String?) -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("Tell the fixer what still needs attention. The issue will reopen for new submissions.")
                    .foregroundStyle(GanamosColor.mutedText)
                TextField("Reason (optional)", text: $reason, axis: .vertical)
                    .lineLimit(4...8).padding(15)
                    .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border))
                Spacer()
                Button("Reject fix", role: .destructive) {
                    let clean = reason.trimmingCharacters(in: .whitespacesAndNewlines)
                    reject(clean.isEmpty ? nil : clean)
                    dismiss()
                }
                .font(.headline).frame(maxWidth: .infinity).frame(height: 50)
                .background(Color.red, in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.white)
            }
            .padding(20).background(GanamosColor.canvas.ignoresSafeArea())
            .navigationTitle("Reject fix")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }.preferredColorScheme(.dark)
    }
}

private struct CloseIssueSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var isConfirming = false
    @FocusState private var usernameIsFocused: Bool
    let reward: Int
    let closeIssue: (String) -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Who completed this fix?").font(.title2.bold())
                    Text("Enter their Ganamos username. Closing the issue releases the \(reward.formatted())-sat reward immediately.")
                        .foregroundStyle(GanamosColor.mutedText)
                }
                HStack(spacing: 6) {
                    Text("@").foregroundStyle(GanamosColor.mutedText)
                    TextField("username", text: $username)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($usernameIsFocused)
                }
                .padding(15).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border))
                Label("Reward transfers cannot be undone.", systemImage: "exclamationmark.shield.fill")
                    .font(.subheadline).foregroundStyle(.orange)
                Spacer()
                Button("Review and close issue") {
                    usernameIsFocused = false
                    isConfirming = true
                }
                    .font(.headline).foregroundStyle(.black)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 12))
                    .disabled(cleanUsername.isEmpty)
                    .opacity(cleanUsername.isEmpty ? 0.5 : 1)
            }
            .padding(20).background(GanamosColor.canvas.ignoresSafeArea())
            .navigationTitle("Mark Complete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { usernameIsFocused = false }
                        .accessibilityLabel("Dismiss keyboard")
                }
            }
            .confirmationDialog("Send \(reward.formatted()) sats to @\(cleanUsername)?", isPresented: $isConfirming, titleVisibility: .visible) {
                Button("Close issue and send reward") { closeIssue(cleanUsername); dismiss() }
                Button("Cancel", role: .cancel) {}
            } message: { Text("This Bitcoin balance transfer cannot be undone.") }
        }.preferredColorScheme(.dark)
    }

    private var cleanUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
    }
}

struct SubmitFixView: View {
    let post: GanamosPost
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var proof = ""
    @State private var note = ""
    @State private var photo: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var isShowingCamera = false
    @State private var didSubmit = false
    @FocusState private var focusedField: EntryField?

    private enum EntryField: Hashable { case proof, note }

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            ScrollView {
                content
            }
        }
        .foregroundStyle(.white)
        .navigationTitle("Submit Fix").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(GanamosColor.canvas, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
                    .accessibilityLabel("Dismiss keyboard")
            }
        }
        .onChange(of: photo) { _, item in Task { photoData = try? await item?.loadTransferable(type: Data.self) } }
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { image in photoData = image.jpegData(compressionQuality: 0.88) }
                .ignoresSafeArea()
        }
        .alert("Fix submitted", isPresented: $didSubmit) {
            Button("Done") { dismiss() }
        } message: {
            Text("The owner will review your work before the reward is released.")
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 22) {
            header
            proofPhoto
            entryField("What did you do?", prompt: "Describe the completed work…", text: $proof, lines: 4...8, field: .proof)
            entryField("Note for the owner", prompt: "Optional details", text: $note, lines: 2...5, field: .note)
            errorMessage
            submitButton
            Text("The reward stays locked until the owner reviews and approves your submission.")
                .font(.caption)
                .foregroundStyle(GanamosColor.mutedText)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20)
        .padding(.top, 64)
        .padding(.bottom, 20)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Show the fix").font(.system(size: 30, weight: .bold))
            Text("Add a clear after photo and tell the owner what you completed.")
                .font(.body)
                .foregroundStyle(GanamosColor.mutedText)
        }
    }

    @ViewBuilder
    private var errorMessage: some View {
        if let error {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(Color.red)
        }
    }

    private var submitButton: some View {
        let isDisabled = isSubmitting || proof.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return Button { Task { await submit() } } label: {
            submitLabel
                .font(.headline)
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.5 : 1)
        .accessibilityIdentifier("submitFixButton")
    }

    private var proofPhoto: some View {
        VStack(spacing: 12) {
            if let photoData, let image = UIImage(data: photoData) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 250)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button { self.photoData = nil; photo = nil } label: {
                            Image(systemName: "xmark").font(.headline).padding(11)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .padding(12)
                    }
            } else {
                VStack(spacing: 17) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 38, weight: .medium))
                        .foregroundStyle(GanamosColor.green)
                    Text("Add an after photo").font(.headline)
                    HStack(spacing: 12) {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button("Take photo", systemImage: "camera") { isShowingCamera = true }
                                .buttonStyle(.borderedProminent).tint(GanamosColor.green)
                        }
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label("Photo library", systemImage: "photo.on.rectangle")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 220)
                .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(GanamosColor.border) }
            }
        }
    }

    private func entryField(
        _ title: String,
        prompt: String,
        text: Binding<String>,
        lines: ClosedRange<Int>,
        field: EntryField
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title).font(.headline)
            TextField(prompt, text: text, axis: .vertical)
                .lineLimit(lines)
                .focused($focusedField, equals: field)
                .accessibilityIdentifier(field == .proof ? "submitFixProof" : "submitFixNote")
                .padding(15)
                .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }
        }
    }

    @ViewBuilder
    private var submitLabel: some View {
        HStack(spacing: 9) {
            if isSubmitting {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(Color.black)
            }
            Text(isSubmitting ? "Submitting…" : "Submit for review")
        }
    }

    private func submit() async {
        guard let token = session.accessToken, let userID = session.userID else { session.isPresentingLogin = true; return }
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do {
            var imageURL: URL?
            if let photoData { imageURL = try await APIClient.shared.uploadPostImage(photoData, accessToken: token, userID: userID, folder: "fixes") }
            try await APIClient.shared.submitFix(postID: post.id, proofText: proof, note: note.isEmpty ? nil : note, imageURL: imageURL, accessToken: token, userID: userID, profile: session.profile)
            didSubmit = true
        } catch { self.error = error.localizedDescription }
    }
}
