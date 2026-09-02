import CoreImage.CIFilterBuiltins
import MapKit
import PhotosUI
import SwiftUI
import UIKit

struct MapScreen: View {
    @Environment(SessionStore.self) private var session
    private let loadsRemotePosts: Bool
    @State private var position: MapCameraPosition = .region(MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 38.2, longitude: -119.4),
        span: MKCoordinateSpan(latitudeDelta: 15, longitudeDelta: 12)
    ))
    @State private var posts: [GanamosPost] = []
    @State private var selectedPost: GanamosPost?
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var rewardedOnly = false
    @State private var isShowingDonate = false

    init(regressionPosts: [GanamosPost]? = nil) {
        loadsRemotePosts = regressionPosts == nil
        _posts = State(initialValue: regressionPosts ?? [])
    }

    private var mappedPosts: [GanamosPost] {
        posts.filter {
            $0.latitude != nil && $0.longitude != nil && (!rewardedOnly || $0.reward > 0)
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Map(position: $position) {
                ForEach(mappedPosts) { post in
                    Annotation("", coordinate: CLLocationCoordinate2D(latitude: post.latitude!, longitude: post.longitude!)) {
                        Button { selectedPost = post } label: {
                            RewardBadge(amount: post.reward)
                                .scaleEffect(0.9)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(post.title ?? "Community fix"), reward \(post.reward) sats")
                        .accessibilityIdentifier("mapPost-\(post.id.uuidString.lowercased())")
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .mapControls { MapCompass() }
            .ignoresSafeArea(edges: .top)

            MapSearchField(text: $searchText, isSearching: isSearching, submit: search)
                .padding(.horizontal, 18)
                .padding(.top, 10)

            VStack {
                Spacer()
                HStack {
                    Spacer()
                    VStack(spacing: 12) {
                        MapGlassButton(image: "LucideGift", label: "Donate to community fixes", isActive: false) {
                            isShowingDonate = true
                        }
                        MapGlassButton(image: "LucideEarth", label: "Show all fixes", isActive: false) {
                            showAllPosts()
                        }
                        MapGlassButton(image: "LucideGift", label: "Rewarded fixes only", isActive: rewardedOnly) {
                            rewardedOnly.toggle()
                        }
                    }
                }
            }
            .padding(.trailing, 18)
            .padding(.bottom, 22)
        }
        .toolbar(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil)
                } label: {
                    Image(systemName: "keyboard.chevron.compact.down")
                }
                .accessibilityLabel("Dismiss keyboard")
            }
        }
        .task {
            guard loadsRemotePosts else { return }
            posts = (try? await APIClient.shared.posts(accessToken: session.accessToken)) ?? []
        }
        .sheet(item: $selectedPost) { post in NavigationStack { PostDetailView(post: post) } }
        .sheet(isPresented: $isShowingDonate) { NavigationStack { DonateView() } }
    }

    private func search() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        isSearching = true
        Task {
            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            if let response = try? await MKLocalSearch(request: request).start(),
               let item = response.mapItems.first {
                position = .region(MKCoordinateRegion(
                    center: item.placemark.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.35, longitudeDelta: 0.35)
                ))
            }
            isSearching = false
        }
    }

    private func showAllPosts() {
        let coordinates = mappedPosts.compactMap { post -> CLLocationCoordinate2D? in
            guard let latitude = post.latitude, let longitude = post.longitude else { return nil }
            return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
        guard let first = coordinates.first else { return }
        let minLatitude = coordinates.map(\.latitude).min() ?? first.latitude
        let maxLatitude = coordinates.map(\.latitude).max() ?? first.latitude
        let minLongitude = coordinates.map(\.longitude).min() ?? first.longitude
        let maxLongitude = coordinates.map(\.longitude).max() ?? first.longitude
        position = .region(MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: (minLatitude + maxLatitude) / 2,
                longitude: (minLongitude + maxLongitude) / 2
            ),
            span: MKCoordinateSpan(
                latitudeDelta: max((maxLatitude - minLatitude) * 1.45, 0.16),
                longitudeDelta: max((maxLongitude - minLongitude) * 1.45, 0.16)
            )
        ))
    }
}

private struct MapSearchField: View {
    @Binding var text: String
    let isSearching: Bool
    let submit: () -> Void

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                content
                    .glassEffect(.regular, in: .capsule)
            } else {
                content
                    .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .shadow(color: .black.opacity(0.16), radius: 10, y: 5)
    }

    private var content: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search location", text: $text)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .onSubmit(submit)
                .accessibilityIdentifier("mapSearch")
            if isSearching {
                ProgressView().controlSize(.small)
            } else if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                .accessibilityIdentifier("mapClearSearch")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
    }
}

private struct MapGlassButton: View {
    let image: String
    let label: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Group {
            if #available(iOS 26.0, *) {
                button
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
            } else {
                button
                    .buttonStyle(.plain)
                    .background(.ultraThinMaterial, in: Circle())
            }
        }
        .tint(isActive ? GanamosColor.green : .primary)
        .accessibilityLabel(label)
        .accessibilityValue(isActive ? "On" : "Off")
        .accessibilityIdentifier(identifier)
    }

    private var button: some View {
        Button(action: action) {
            Image(image)
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .frame(width: 22, height: 22)
                .frame(width: 44, height: 44)
        }
    }

    private var identifier: String {
        switch label {
        case "Donate to community fixes": "mapDonate"
        case "Show all fixes": "mapShowAll"
        case "Rewarded fixes only": "mapRewardedOnly"
        default: "mapControl"
        }
    }
}

struct WalletView: View {
    @Environment(SessionStore.self) private var session
    @State private var webDestination: WebDestination?
    @State private var transactions: [WalletTransaction] = []
    @State private var bitcoinPrice: Double?
    @State private var isLoading = false
    @State private var error: String?
    @State private var isReceiving = false
    @State private var isSending = false
    @AppStorage("walletConnectPromptDismissed") private var connectPromptDismissed = false

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: 18) {
                    balanceCard
                    walletActions
                    if !connectPromptDismissed { connectWalletBanner }
                    transactionHistory
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: session.accessToken) { await load() }
        .sheet(item: $webDestination) { destination in NativeWebSheet(url: destination.url).ignoresSafeArea() }
        .sheet(isPresented: $isReceiving) { WalletReceiveView() }
        .sheet(isPresented: $isSending) { WalletSendView { Task { await load() } } }
        .preferredColorScheme(.dark)
        .overlay {
            if !session.isAuthenticated {
                ZStack {
                    GanamosColor.canvas.ignoresSafeArea()
                    AuthenticationRequiredView(
                        pageTitle: "Bitcoin Wallet",
                        accessTitle: "Sign up to access your wallet",
                        message: "Create an account to access your Bitcoin wallet and manage your earnings.",
                        signIn: { session.isPresentingLogin = true })
                }
            }
        }
    }

    private var balanceCard: some View {
        VStack(spacing: 8) {
            Circle()
                .fill(Color.orange.opacity(0.16))
                .frame(width: 58, height: 58)
                .overlay(Image("BitcoinLogo").resizable().scaledToFit().frame(width: 34, height: 34))
                .padding(.bottom, 2)
            Text("Current Balance")
                .font(.subheadline)
                .foregroundStyle(GanamosColor.mutedText)
            Text(compactSats(session.profile?.balance ?? 0))
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(usdBalance)
                .font(.subheadline)
                .foregroundStyle(GanamosColor.mutedText)
                .opacity(bitcoinPrice == nil ? 0 : 1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(GanamosColor.border))
    }

    private var walletActions: some View {
        HStack(spacing: 14) {
            WalletAction(title: "Receive", icon: "arrow.down", color: GanamosColor.green) {
                if session.isAuthenticated { isReceiving = true } else { session.isPresentingLogin = true }
            }
            WalletAction(title: "Send", icon: "arrow.up", color: .red) {
                if session.isAuthenticated { isSending = true } else { session.isPresentingLogin = true }
            }
        }
    }

    private var connectWalletBanner: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Connect Your Lightning Wallet").font(.headline)
                    Text("Use your own wallet for full control of your funds.")
                        .font(.subheadline).foregroundStyle(GanamosColor.mutedText)
                }
                Spacer()
                Button { connectPromptDismissed = true } label: {
                    Image(systemName: "xmark").foregroundStyle(GanamosColor.mutedText)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
            Button { openSecureWalletPath("/wallet") } label: {
                HStack(spacing: 10) {
                    Image(systemName: "bolt")
                    Text("Connect Wallet").fontWeight(.semibold)
                    Image(systemName: "chevron.right").font(.caption)
                }
                .padding(.horizontal, 16).frame(height: 48)
                .background(Color.purple, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            Text("Works with Alby, Zeus, Mutiny & more")
                .font(.caption).foregroundStyle(GanamosColor.mutedText)
        }
        .padding(18)
        .foregroundStyle(.white)
        .background(Color.purple.opacity(0.14), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.purple.opacity(0.55)))
    }

    private var transactionHistory: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Transaction History", systemImage: "clock.arrow.circlepath")
                .font(.title3.weight(.semibold)).foregroundStyle(.white)
            if isLoading && transactions.isEmpty { ProgressView().frame(maxWidth: .infinity).padding() }
            else if let error { Text(error).font(.subheadline).foregroundStyle(GanamosColor.mutedText).padding(.vertical, 8) }
            else if transactions.isEmpty { Text("No transactions yet").foregroundStyle(GanamosColor.mutedText).padding(.vertical, 8) }
            else {
                LazyVStack(spacing: 0) {
                    ForEach(Array(transactions.enumerated()), id: \.element.id) { index, transaction in
                        TransactionRow(transaction: transaction)
                        if index < transactions.count - 1 { Divider().overlay(GanamosColor.border).padding(.leading, 46) }
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(GanamosColor.border))
    }

    private var usdBalance: String {
        guard let bitcoinPrice else { return "$0.00 USD" }
        let usd = Double(session.profile?.balance ?? 0) / 100_000_000 * bitcoinPrice
        return String(format: "$%.2f USD", usd)
    }

    private func compactSats(_ amount: Int) -> String {
        guard abs(amount) >= 1_000 else { return "\(amount.formatted()) sats" }
        let value = Double(amount) / 1_000
        let text = value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        return "\(text)k sats"
    }

    private func openSecureWalletPath(_ path: String) {
        if session.isAuthenticated { webDestination = WebDestination(url: URL(string: "https://ganamos.earth\(path)")!) }
        else { session.isPresentingLogin = true }
    }

    private func load() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            async let profile: Void = session.refreshProfile()
            async let activity = APIClient.shared.transactions(accessToken: token, userID: userID)
            async let price = APIClient.shared.bitcoinPrice()
            _ = try await profile
            transactions = try await activity
            bitcoinPrice = try? await price
        } catch { self.error = error.localizedDescription }
    }
}

private struct WalletAction: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                Image(systemName: icon).font(.title3.weight(.medium)).foregroundStyle(color)
                Text(title).font(.headline).foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity).frame(height: 104)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(GanamosColor.border))
        }
        .buttonStyle(.plain)
    }
}

private struct TransactionRow: View {
    let transaction: WalletTransaction
    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill((transaction.amount >= 0 ? GanamosColor.green : Color.red).opacity(0.15))
                .frame(width: 34, height: 34)
                .overlay(Image(systemName: transaction.amount >= 0 ? "arrow.down" : "arrow.up")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(transaction.amount >= 0 ? GanamosColor.green : .red))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(transaction.memo ?? transaction.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(transaction.amount > 0 ? "+" : "")\(transaction.amount) sats").fontWeight(.semibold)
                Text(transaction.status.rawValue.capitalized).font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 12)
    }

    private var title: String {
        switch transaction.type {
        case .deposit: "Deposit"
        case .withdrawal: "Withdrawal"
        case .internalTransfer: transaction.amount >= 0 ? "Received" : "Sent"
        }
    }
}

struct ProfileView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var overview = ProfileOverview(postsCount: 0, familyMembers: [])
    @State private var bitcoinPrice: Double?
    @State private var isConfirmingLogout = false
    @State private var isShowingQRCode = false
    @State private var sendRecipient: FamilyMember?
    @State private var petWebDestination: WebDestination?
    private let usesRegressionBitcoinPrice: Bool
    private let regressionShowsAdminMenu: Bool?
    private let regressionAdminStats: AdminStats?

    init(
        regressionOverview: ProfileOverview = ProfileOverview(postsCount: 0, familyMembers: []),
        regressionBitcoinPrice: Double? = nil,
        regressionShowsAdminMenu: Bool? = nil,
        regressionAdminStats: AdminStats? = nil
    ) {
        _overview = State(initialValue: regressionOverview)
        _bitcoinPrice = State(initialValue: regressionBitcoinPrice)
        usesRegressionBitcoinPrice = regressionBitcoinPrice != nil
        self.regressionShowsAdminMenu = regressionShowsAdminMenu
        self.regressionAdminStats = regressionAdminStats
    }

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: 16) {
                    profileCard
                    familyCard
                    menu
                }
                .padding(.horizontal, 16)
                // Mobile web uses `pt-6` (24 pt) before the first identity
                // surface. Preserve that breathing room below the native safe
                // area instead of pulling the card eight points upward.
                .padding(.top, 24)
                .padding(.bottom, 28)
            }
            .refreshable { await load() }
        }
        // Mobile web starts with the identity card rather than reserving an
        // empty header band. Hide chrome only on this root; pushed native
        // destinations explicitly restore their navigation bar below.
        .toolbar(.hidden, for: .navigationBar)
        .preferredColorScheme(.dark)
        // The active profile can change without the bearer token changing.
        // Key Profile loading to that identity so posts, relationships, and
        // pet state follow the account selected from the mobile-web-equivalent
        // name menu below. Deterministic previews keep their supplied state.
        .task(id: session.userID) {
            guard !usesRegressionBitcoinPrice else { return }
            await load()
        }
        .sheet(isPresented: $isShowingQRCode) {
            ProfileQRCodeSheet()
                // The QR, identity copy, and action do not fit safely above a
                // compact iPhone's keyboard-sized sheet region. Use the native
                // full-height presentation so the inline navigation title and
                // content keep separate layout zones on every supported size.
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $sendRecipient) { member in
            WalletSendView(initialRecipient: member.username ?? member.id.uuidString.lowercased()) {}
        }
        .sheet(item: $petWebDestination, onDismiss: {
            petWebDestination = nil
        }) { destination in
            NativeWebSheet(url: destination.url) {
                petWebDestination = nil
            }
                .ignoresSafeArea()
        }
        .confirmationDialog("Log out of Ganamos?", isPresented: $isConfirmingLogout, titleVisibility: .visible) {
            Button("Log out", role: .destructive) { session.signOut() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You’ll need to sign in again to access your profile and wallet.")
        }
        .overlay {
            if !session.isAuthenticated {
                ZStack {
                    GanamosColor.canvas.ignoresSafeArea()
                    AuthenticationRequiredView(
                        pageTitle: "Profile",
                        accessTitle: "Sign up to access your profile",
                        message: "Create an account to access your profile and track your activity.",
                        signIn: { session.isPresentingLogin = true })
                }
            }
        }
    }

    private var profileCard: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 18) {
                    profileIdentity
                        .frame(maxWidth: .infinity)
                    Divider().overlay(GanamosColor.border)
                    profileMetrics
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    profileIdentity
                        .frame(maxWidth: .infinity)
                    profileMetrics
                        .frame(width: 130, alignment: .leading)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 28)
        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(GanamosColor.border))
    }

    private var familyCard: some View {
        LazyVGrid(columns: familyColumns, spacing: 16) {
            ForEach(overview.familyMembers) { member in
                Button { sendRecipient = member } label: {
                    VStack(spacing: 8) {
                        AsyncImage(url: member.avatarURL) { image in image.resizable().scaledToFill() } placeholder: {
                            Circle().fill(GanamosColor.border).overlay(Image(systemName: "person.fill"))
                        }.frame(width: 48, height: 48).clipShape(Circle())
                        // Match FamilySection on mobile web: an unnamed
                        // relationship keeps a neutral `Child` label instead
                        // of exposing its username as display copy.
                        Text(familyDisplayName(member))
                            .font(.system(size: 14, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        HStack(spacing: 3) {
                            Image("BitcoinLogo").resizable().scaledToFit().frame(width: 12, height: 12)
                            Text(compactFamilyBalance(member.balance)).font(.caption2).foregroundStyle(GanamosColor.mutedText)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Send sats to \(familyDisplayName(member))")
            }
            NavigationLink { profileDestination { FamilyAccountsView() } } label: {
                VStack(spacing: 8) {
                    Circle().stroke(GanamosColor.border, style: StrokeStyle(lineWidth: 2, dash: [5])).frame(width: 48, height: 48)
                        .overlay(Image(systemName: "plus").foregroundStyle(GanamosColor.mutedText))
                    Text("Add").font(.system(size: 14, weight: .medium)).foregroundStyle(GanamosColor.mutedText)
                    Text(" ").font(.caption2)
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("profileAddFamilyMember")
        }
        .padding(.horizontal, 16)
        .padding(.top, 32)
        .padding(.bottom, 16)
        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(GanamosColor.border))
        .accessibilityIdentifier("profileFamilyCard")
    }

    private var profileIdentity: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                NavigationLink { profileDestination { AccountSettingsView() } } label: {
                    AsyncImage(url: session.profile?.avatarURL) { image in image.resizable().scaledToFill() } placeholder: {
                        Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(GanamosColor.mutedText)
                    }
                    .frame(width: 112, height: 112)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(GanamosColor.border, lineWidth: 3))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit profile picture")

                Button { isShowingQRCode = true } label: {
                    Image(systemName: "qrcode")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(GanamosColor.green, in: Circle())
                        .overlay(Circle().stroke(GanamosColor.surface, lineWidth: 3))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("My QR code")
                .accessibilityIdentifier("profileQRCode")
            }
            profileName
            // Mobile web keeps this identity line present when an account has
            // not claimed a username yet, using `@username` as the fallback.
            // Preserve the same content and vertical rhythm on native Profile.
            Text(profileUsername.map { "@\($0)" } ?? "@username")
                .font(.subheadline)
                .foregroundStyle(GanamosColor.mutedText)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        // Keep the avatar link and QR action as distinct controls. Combining this
        // stack synthesizes a parent button around both interactive children on
        // iOS 26, which can intercept the QR action and is invalid VoiceOver
        // hierarchy for nested controls.
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var profileName: some View {
        if session.connectedAccounts.isEmpty {
            profileNameText
                .accessibilityIdentifier(profileIdentityIdentifier)
        } else {
            Menu {
                accountButton(
                    session.mainProfile,
                    fallbackName: "Main Account",
                    isOwner: true,
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
            } label: {
                HStack(spacing: 4) {
                    profileNameText
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(GanamosColor.mutedText)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Switch account, \(firstName)")
            .accessibilityIdentifier(profileIdentityIdentifier)
        }
    }

    private var profileNameText: some View {
        Text(firstName)
            .font(.system(size: 24, weight: .bold))
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .multilineTextAlignment(.center)
    }

    @ViewBuilder private func accountButton(
        _ account: UserProfile?,
        fallbackName: String,
        isOwner: Bool = false,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        if let account {
            Button(action: action) {
                Label(
                    accountMenuName(account, fallback: fallbackName, isOwner: isOwner),
                    systemImage: isSelected ? "checkmark.circle.fill" : "person.crop.circle")
            }
            .accessibilityValue(isSelected ? "Selected" : "")
        }
    }

    private var profileIdentityIdentifier: String {
        dynamicTypeSize.isAccessibilitySize
            ? "profileIdentityCardAccessibility"
            : "profileIdentityCard"
    }

    private func accountName(_ account: UserProfile, fallback: String) -> String {
        guard let name = account.name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else {
            return fallback
        }
        return name
    }

    private func accountMenuName(_ account: UserProfile, fallback: String, isOwner: Bool) -> String {
        let name = accountName(account, fallback: fallback)
        guard isOwner else { return name }
        return "\(name.split(separator: " ").first.map(String.init) ?? name) (You)"
    }

    private var profileMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            NavigationLink { profileDestination { WalletView() } } label: {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Image("BitcoinLogo").resizable().scaledToFit().frame(width: 16, height: 16)
                        Text(compactProfileBalance(session.profile?.balance ?? 0)).font(.system(size: 22, weight: .bold))
                        Text(usdBalance)
                            .font(.subheadline)
                            .foregroundStyle(GanamosColor.mutedText)
                            .accessibilityIdentifier("profileUsdBalance")
                    }
                    Text("Balance").font(.caption2).foregroundStyle(GanamosColor.mutedText)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open wallet, balance \(compactProfileBalance(session.profile?.balance ?? 0)) sats")
            Divider().overlay(GanamosColor.border)
            HStack(spacing: 24) {
                stat(session.profile?.fixedIssuesCount ?? 0, label: "Fixes")
                stat(overview.postsCount, label: "Posts")
            }
            Divider().overlay(GanamosColor.border)
            Button {
                petWebDestination = WebDestination(url: URL(string: "https://ganamos.earth\(petDestinationPath)")!)
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    petIcon
                    Text(overview.pet?.name ?? "Connect Pet")
                        .font(.caption2)
                        .foregroundStyle(GanamosColor.mutedText)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(overview.pet.map { "Open \($0.name) settings" } ?? "Connect Pet")
            .accessibilityValue(petDestinationPath)
            .accessibilityIdentifier("profilePetDestination")
        }
    }

    private var petDestinationPath: String {
        overview.pet == nil ? "/connect-pet" : "/pet-settings"
    }

    private var petSymbol: String {
        switch overview.pet?.type {
        case "dog": "dog.fill"
        case "rabbit": "hare.fill"
        case "squirrel": "LucideSquirrel"
        case "turtle": "tortoise.fill"
        case "owl": "bird.fill"
        case "cat": "cat.fill"
        // Mobile web uses its cat glyph both before a pet is connected and
        // when a device reports an unrecognized pet type.
        default: "cat.fill"
        }
    }

    @ViewBuilder private var petIcon: some View {
        Group {
            if petSymbol == "LucideSquirrel" {
                Image("LucideSquirrel")
                    .resizable()
                    .scaledToFit()
                    .padding(5)
            } else {
                Image(systemName: petSymbol)
                    .font(.system(size: 15, weight: .semibold))
            }
        }
        // Match mobile web's disconnected treatment: the empty-state cat is
        // deliberately quieter than a connected pet's active white glyph.
        .foregroundStyle(overview.pet == nil ? GanamosColor.mutedText : .white)
        .frame(width: 28, height: 28)
        .background(petBackground, in: Circle())
        .accessibilityIdentifier("profilePetIcon-\(petSymbol)")
    }

    private var petBackground: AnyShapeStyle {
        guard overview.pet != nil else { return AnyShapeStyle(Color.gray.opacity(0.55)) }
        return AnyShapeStyle(LinearGradient(
            colors: [Color.purple.opacity(0.9), Color.blue],
            startPoint: .topLeading,
            endPoint: .bottomTrailing))
    }

    private var familyColumns: [GridItem] {
        if dynamicTypeSize.isAccessibilitySize {
            return [GridItem(.adaptive(minimum: 120), spacing: 12)]
        }
        return Array(repeating: GridItem(.flexible(), spacing: 0), count: 4)
    }

    private var menu: some View {
        VStack(spacing: 0) {
            menuRow("Account settings", icon: "gearshape") { AccountSettingsView() }
            menuRow("Groups", icon: "person.2") { GroupsView() }
            menuRow("Activity", icon: "waveform.path.ecg") { ActivityView() }
            menuRow("Posts", icon: "camera") { UserPostsView() }
            if showsAdminMenu {
                menuRow("Admin", icon: "shield") { AdminView(regressionStats: regressionAdminStats) }
            }
            Button { isConfirmingLogout = true } label: {
                HStack(spacing: 16) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.title3).frame(width: 24).foregroundStyle(GanamosColor.mutedText)
                    Text("Log out").font(.system(size: 15)).foregroundStyle(.white)
                    Spacer()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 16)
                .padding(.horizontal, 4)
            }.buttonStyle(.plain)
        }
    }

    private func menuRow<Destination: View>(_ title: String, icon: String, @ViewBuilder destination: () -> Destination) -> some View {
        NavigationLink(destination: profileDestination { destination() }) {
            HStack(spacing: 16) {
                Image(systemName: icon).font(.title3).frame(width: 24).foregroundStyle(GanamosColor.mutedText)
                Text(title).font(.system(size: 15)).foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(GanamosColor.mutedText)
            }
            .padding(.vertical, 16)
            .padding(.horizontal, 4)
        }.buttonStyle(.plain)
    }

    private func profileDestination<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content().toolbar(.visible, for: .navigationBar)
    }

    private func stat(_ value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value.formatted()).font(.system(size: 22, weight: .bold))
            Text(label).font(.caption2).foregroundStyle(GanamosColor.mutedText)
        }
    }

    private var firstName: String { session.profile?.name?.split(separator: " ").first.map(String.init) ?? "Profile" }
    private var showsAdminMenu: Bool {
        if let regressionShowsAdminMenu { return regressionShowsAdminMenu }
        guard
            let configuredEmail = Bundle.main.object(forInfoDictionaryKey: "GANAMOS_ADMIN_EMAIL") as? String,
            !configuredEmail.isEmpty,
            !configuredEmail.hasPrefix("$("),
            let accountEmail = session.email ?? session.profile?.email
        else { return false }
        return accountEmail.caseInsensitiveCompare(configuredEmail) == .orderedSame
    }
    private var profileUsername: String? {
        guard let username = session.profile?.username, !username.isEmpty else { return nil }
        return username
    }
    private var usdBalance: String {
        // Match mobile web's resilient Profile presentation: keep the fiat
        // context visible while a fresh quote is unavailable, then replace it
        // with the live value after loading.
        let price = bitcoinPrice ?? 100_000
        return "$\(Int((Double(session.profile?.balance ?? 0) / 100_000_000 * price).rounded()))"
    }
    private func compactProfileBalance(_ amount: Int) -> String {
        if abs(amount) >= 100_000 { return "\(amount / 1_000)k" }
        if abs(amount) > 999 { return String(format: "%.1fk", Double(amount) / 1_000) }
        return amount.formatted()
    }

    private func compactFamilyBalance(_ amount: Int) -> String {
        guard abs(amount) >= 1_000 else { return amount.formatted() }
        return "\(amount / 1_000)k"
    }

    private func familyDisplayName(_ member: FamilyMember) -> String {
        guard let firstName = member.name?.split(separator: " ").first else { return "Child" }
        return String(firstName)
    }
    private func load() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        try? await session.refreshProfile()
        overview = (try? await APIClient.shared.profileOverview(accessToken: token, userID: userID)) ?? overview
        if !usesRegressionBitcoinPrice {
            bitcoinPrice = try? await APIClient.shared.bitcoinPrice()
        }
    }
}

private struct ProfileQRCodeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var didCopy = false

    // Match the mobile-web QR dialog's visible identity fallback. API rows can
    // carry an empty string as well as null, and neither should collapse the
    // title area above the QR code.
    private var name: String {
        guard let name = session.profile?.name, !name.isEmpty else { return "User" }
        return name
    }
    // Mobile web treats an empty username like a missing value for both the
    // visible fallback and the QR payload. Normalize the API edge state here
    // so the sheet never displays a bare `@` or disables account-ID copying.
    private var username: String? {
        guard let username = session.profile?.username, !username.isEmpty else { return nil }
        return username
    }
    private var accountID: String { session.userID?.uuidString.lowercased() ?? "" }
    private var value: String { username ?? accountID }
    private var displayedValue: String { username.map { "@\($0)" } ?? accountID }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                VStack(spacing: 6) {
                    Text(name)
                        .font(.headline)
                        .accessibilityIdentifier("profileQRCodeName")
                    Text("Share this QR code to connect accounts")
                        .font(.subheadline)
                        .foregroundStyle(GanamosColor.mutedText)
                }
                if let image = qrImage(value) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 200, height: 200)
                        .padding(12)
                        .background(.white, in: RoundedRectangle(cornerRadius: 10))
                }

                HStack(spacing: 8) {
                    NavigationLink {
                        AccountSettingsView()
                            .toolbar(.visible, for: .navigationBar)
                    } label: {
                        HStack(spacing: 8) {
                            Text(displayedValue)
                                .font(.system(.caption, design: .monospaced))
                                .lineLimit(1)
                                .truncationMode(.middle)
                                .foregroundStyle(.primary)
                                .accessibilityIdentifier("profileQRCodeIdentity")
                            Spacer(minLength: 4)
                            Image(systemName: "pencil")
                                .foregroundStyle(GanamosColor.mutedText)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit username")
                    .accessibilityIdentifier("profileQRCodeEditUsername")

                    Button {
                        UIPasteboard.general.string = value
                        didCopy = true
                    } label: {
                        Image(systemName: didCopy ? "checkmark" : "doc.on.doc")
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(GanamosColor.green)
                    .accessibilityLabel(didCopy ? "Copied" : (username == nil ? "Copy account ID" : "Copy username"))
                    .disabled(value.isEmpty)
                }
                .padding(.leading, 12)
                .padding(.trailing, 6)
                .padding(.vertical, 6)
                .frame(width: 232, height: 44)
                .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(GanamosColor.canvas)
            .navigationTitle("My QR Code")
            // Account Settings refreshes SessionStore after a successful save.
            // Read identity from that shared source so the visible value and QR
            // update immediately instead of retaining the sheet-open snapshot.
            .onChange(of: value) { _, _ in didCopy = false }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
    }

    private func qrImage(_ value: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 9, y: 9)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
