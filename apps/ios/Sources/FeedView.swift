import PhotosUI
import MapKit
import SwiftUI

@MainActor @Observable
final class FeedModel {
    var posts: [GanamosPost] = []
    var isLoading = false
    var error: String?

    func load(token: String?) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do { posts = try await APIClient.shared.posts(accessToken: token) }
        catch { self.error = error.localizedDescription }
    }
}

struct FeedView: View {
    @Environment(SessionStore.self) private var session
    @State private var model = FeedModel()
    @State private var searchText = ""

    private var filteredPosts: [GanamosPost] {
        guard !searchText.isEmpty else { return model.posts }
        return model.posts.filter { ($0.title ?? "").localizedCaseInsensitiveContains(searchText) || $0.description.localizedCaseInsensitiveContains(searchText) }
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
                            NavigationLink(value: post) { PostCard(post: post) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
                }
                .refreshable { await model.load(token: session.accessToken) }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search fixes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if session.isAuthenticated { SatsBadge(amount: session.profile?.balance ?? 0) }
                else { Button("Sign In") { session.isPresentingLogin = true } }
            }
        }
        .navigationDestination(for: GanamosPost.self) { PostDetailView(post: $0) }
        .task { if model.posts.isEmpty { await model.load(token: session.accessToken) } }
        .preferredColorScheme(.dark)
    }
}

private struct PostCard: View {
    let post: GanamosPost

    private var displayTitle: String { post.title?.isEmpty == false ? post.title! : post.description }

    var body: some View {
        VStack(spacing: 0) {
            AsyncImage(url: post.imageURL) { image in image.resizable().scaledToFill() } placeholder: {
                ZStack { GanamosColor.green.opacity(0.12); Image(systemName: "wrench.and.screwdriver").foregroundStyle(GanamosColor.green) }
            }
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
    }
}

struct PostDetailView: View {
    let post: GanamosPost
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var isPresentingFix = false
    @State private var isGroupAdmin = false
    @State private var deadline: Date?

    private var displayTitle: String {
        post.title?.isEmpty == false ? post.title! : "Community fix"
    }

    private var isOpen: Bool {
        post.fixed != true && post.underReview != true && post.deletedAt == nil
    }

    private var canMarkComplete: Bool {
        guard let userID = session.userID else { return false }
        return isOpen && (post.userID == userID || isGroupAdmin)
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
                                    Circle().fill(.blue).frame(width: 7, height: 7)
                                    Text("Open")
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

                        // Deadline control directly above Mark Complete
                        if let userID = session.userID, post.userID == userID {
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
                                openURL(URL(string: "https://ganamos.earth/post/\(post.id.uuidString.lowercased())")!)
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
                            .accessibilityHint("Opens the secure completion flow")
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 22)
                    .padding(.bottom, 32)
                }
            }
            .ignoresSafeArea(edges: .top)

            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.16), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.leading, 16)
            .padding(.top, 8)
            .accessibilityLabel("Back")
        }
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .sheet(isPresented: $isPresentingFix) { NavigationStack { SubmitFixView(post: post) } }
        .task(id: session.userID) {
            await loadGroupAdminStatus()
            deadline = post.expiresAt
        }
        .preferredColorScheme(.dark)
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

private struct SubmitFixView: View {
    let post: GanamosPost
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var proof = ""
    @State private var note = ""
    @State private var photo: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var isSubmitting = false
    @State private var error: String?

    var body: some View {
        Form {
            Section("Proof of completion") {
                TextField("What did you do?", text: $proof, axis: .vertical).lineLimit(3...7)
                TextField("Optional note", text: $note, axis: .vertical).lineLimit(2...5)
                PhotosPicker(selection: $photo, matching: .images) { Label("Add proof photo", systemImage: "camera.fill") }
                if photoData != nil { Label("Photo ready", systemImage: "checkmark.circle.fill").foregroundStyle(GanamosColor.green) }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Button { Task { await submit() } } label: {
                if isSubmitting { ProgressView().frame(maxWidth: .infinity) }
                else { Text("Submit for review").frame(maxWidth: .infinity) }
            }.disabled(isSubmitting || proof.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .navigationTitle("Submit Fix").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .onChange(of: photo) { _, item in Task { photoData = try? await item?.loadTransferable(type: Data.self) } }
    }

    private func submit() async {
        guard let token = session.accessToken, let userID = session.userID else { session.isPresentingLogin = true; return }
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do {
            var imageURL: URL?
            if let photoData { imageURL = try await APIClient.shared.uploadPostImage(photoData, accessToken: token, userID: userID, folder: "fixes") }
            try await APIClient.shared.submitFix(postID: post.id, proofText: proof, note: note.isEmpty ? nil : note, imageURL: imageURL, accessToken: token, userID: userID, profile: session.profile)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
