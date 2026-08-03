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
            try await APIClient.shared.createPost(title: title, description: details, location: location, imageURL: imageURL, reward: reward, accessToken: token, userID: userID, profile: session.profile)
            try await session.refreshProfile()
            didCreate = true
        } catch { self.error = error.localizedDescription }
    }

    private func reset() {
        title = ""; details = ""; location = ""; reward = 0; photo = nil; photoData = nil
    }
}

struct WalletView: View {
    @Environment(SessionStore.self) private var session
    @State private var transactions: [WalletTransaction] = []
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                VStack(spacing: 10) {
                    Text("\(session.profile?.balance ?? 0) sats")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                    Text("Available balance").foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity).padding()
            }
            Section("Recent activity") {
                if isLoading { ProgressView().frame(maxWidth: .infinity) }
                else if let error { Text(error).foregroundStyle(.secondary) }
                else if transactions.isEmpty { Text("No transactions yet").foregroundStyle(.secondary) }
                else { ForEach(transactions) { TransactionRow(transaction: $0) } }
            }
        }
        .navigationTitle("Wallet")
        .refreshable { await load() }
        .task(id: session.accessToken) { await load() }
        .overlay {
            if !session.isAuthenticated {
                EmptyState(icon: "lock.fill", title: "Sign in to view your wallet", message: "Your Ganamos balance and Lightning activity will appear here.")
                    .onTapGesture { session.isPresentingLogin = true }
            }
        }
    }

    private func load() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            async let profile: Void = session.refreshProfile()
            async let activity = APIClient.shared.transactions(accessToken: token, userID: userID)
            _ = try await profile
            transactions = try await activity
        } catch { self.error = error.localizedDescription }
    }
}

private struct TransactionRow: View {
    let transaction: WalletTransaction
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.amount >= 0 ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                .font(.title2).foregroundStyle(transaction.amount >= 0 ? GanamosColor.green : .red)
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
        }.padding(.vertical, 4)
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
