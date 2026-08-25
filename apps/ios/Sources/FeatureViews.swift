import MapKit
import PhotosUI
import SwiftUI

struct MapScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var position: MapCameraPosition = .automatic
    @State private var posts: [GanamosPost] = []
    @State private var selectedPost: GanamosPost?
    var body: some View {
        Map(position: $position) {
            ForEach(posts.filter { $0.latitude != nil && $0.longitude != nil }) { post in
                Annotation(post.title ?? "Community fix", coordinate: CLLocationCoordinate2D(latitude: post.latitude!, longitude: post.longitude!)) {
                    Button { selectedPost = post } label: {
                        ZStack {
                            Circle().fill(GanamosColor.green).frame(width: 38, height: 38).shadow(radius: 3)
                            Image(systemName: "wrench.and.screwdriver.fill").foregroundStyle(.white)
                        }
                    }.buttonStyle(.plain)
                }
            }
        }
        .mapControls { MapCompass(); MapUserLocationButton() }
        .navigationTitle("Nearby").navigationBarTitleDisplayMode(.inline)
        .task { posts = (try? await APIClient.shared.posts(accessToken: session.accessToken)) ?? [] }
        .sheet(item: $selectedPost) { post in NavigationStack { PostDetailView(post: post) } }
    }
}

struct NewFixView: View {
    @Environment(SessionStore.self) private var session
    @State private var navigateToPost: GanamosPost?
    @State private var title = ""
    @State private var details = ""
    @State private var location = ""
    @State private var reward = 0
    @State private var photo: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var didCreate = false
    var body: some View {
        Form {
            // Invisible navigation link to detail after creation
            NavigationLink(isActive: .constant(navigateToPost != nil)) {
                if let post = navigateToPost {
                    PostDetailView(post: post)
                } else {
                    EmptyView()
                }
            } label: { EmptyView() }
            Section("What needs fixing?") {
                TextField("Short title", text: $title)
                TextField("Describe the problem", text: $details, axis: .vertical).lineLimit(4...8)
                PhotosPicker(selection: $photo, matching: .images) { Label("Add photo", systemImage: "camera.fill") }
                if photoData != nil { Label("Photo ready", systemImage: "checkmark.circle.fill").foregroundStyle(GanamosColor.green) }
            }
            Section("Where") { TextField("Location", text: $location) }
            Section("Reward") {
                Stepper("\(reward) sats", value: $reward, in: 0...10_000, step: 50)
                if reward > 0 { Text("Your reward is reserved from your balance when the post is created.").font(.caption).foregroundStyle(.secondary) }
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button { Task { await submit() } } label: {
                if isSubmitting { ProgressView().frame(maxWidth: .infinity) }
                else { Text("Post fix").frame(maxWidth: .infinity) }
            }
                .disabled(isSubmitting || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .buttonStyle(.borderedProminent)
        }
        .navigationTitle("New Fix")
        .onChange(of: photo) { _, item in Task { photoData = try? await item?.loadTransferable(type: Data.self) } }
        .alert("Posted", isPresented: $didCreate) { Button("OK") { reset() } } message: { Text("Your community fix is now live.") }
    }

    private func submit() async {
        guard session.isAuthenticated, let token = session.accessToken, let userID = session.userID else {
            session.isPresentingLogin = true; return
        }
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do {
            var imageURL: URL?
            if let photoData { imageURL = try await APIClient.shared.uploadPostImage(photoData, accessToken: token, userID: userID, folder: "posts") }
            let result = try await APIClient.shared.createPost(title: title, description: details, location: location, imageURL: imageURL, reward: reward, accessToken: token, userID: userID, profile: session.profile)
            try await session.refreshProfile()
            // Navigate to the newly created post's detail view
            navigateToPost = GanamosPost(
                id: result.postID,
                title: title.isEmpty ? nil : title,
                description: details,
                imageURL: imageURL,
                location: location.isEmpty ? nil : location,
                latitude: nil,
                longitude: nil,
                reward: reward,
                createdAt: Date(),
                expiresAt: nil,
                group: nil,
                userID: userID,
                fixed: false,
                underReview: false,
                deletedAt: nil
            )
            didCreate = false
        } catch { self.error = error.localizedDescription }
    }

    private func reset() {
        title = ""; details = ""; location = ""; reward = 0; photo = nil; photoData = nil
    }
}

struct WalletView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL
    @State private var transactions: [WalletTransaction] = []
    @State private var bitcoinPrice: Double?
    @State private var isLoading = false
    @State private var error: String?
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
        .preferredColorScheme(.dark)
        .overlay {
            if !session.isAuthenticated {
                ZStack {
                    GanamosColor.canvas.ignoresSafeArea()
                    EmptyState(icon: "lock.fill", title: "Sign in to view your wallet", message: "Your Ganamos balance and Lightning activity will appear here.")
                    .onTapGesture { session.isPresentingLogin = true }
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
                openSecureWalletPath("/wallet/deposit")
            }
            WalletAction(title: "Send", icon: "arrow.up", color: .red) {
                openSecureWalletPath("/wallet/withdraw")
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
        if session.isAuthenticated { openURL(URL(string: "https://ganamos.earth\(path)")!) }
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
    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    AsyncImage(url: session.profile?.avatarURL) { image in image.resizable().scaledToFill() } placeholder: {
                        Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(GanamosColor.green)
                    }.frame(width: 54, height: 54).clipShape(Circle())
                    VStack(alignment: .leading) {
                        Text(session.profile?.name ?? session.email ?? "Guest").font(.headline)
                        Text(session.profile?.username.map { "@\($0)" } ?? (session.isAuthenticated ? "Ganamos member" : "Sign in to join your community"))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if let profile = session.profile {
                Section {
                    LabeledContent("Balance", value: "\(profile.balance) sats")
                    LabeledContent("Fixes completed", value: "\(profile.fixedIssuesCount)")
                }
            }
            Section { Label("My fixes", systemImage: "wrench.and.screwdriver"); Label("Activity", systemImage: "bolt.fill"); Label("Groups", systemImage: "person.3.fill"); Label("Settings", systemImage: "gearshape.fill") }
            if session.isAuthenticated { Section { Button("Sign Out", role: .destructive) { session.signOut() } } }
            else { Section { Button("Sign In") { session.isPresentingLogin = true } } }
        }.navigationTitle("Profile").refreshable { try? await session.refreshProfile() }
    }
}
