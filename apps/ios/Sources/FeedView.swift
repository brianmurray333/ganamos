import PhotosUI
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
        Group {
            if model.isLoading && model.posts.isEmpty { ProgressView("Finding nearby fixes…") }
            else if let error = model.error, model.posts.isEmpty {
                EmptyState(icon: "wifi.exclamationmark", title: "Couldn’t load fixes", message: error)
            } else if filteredPosts.isEmpty {
                EmptyState(icon: "wrench.and.screwdriver", title: "No open fixes", message: "Try another search or check back soon.")
            } else {
                List(filteredPosts) { post in NavigationLink(value: post) { PostRow(post: post) } }
                    .listStyle(.plain)
            }
        }
        .navigationTitle("Ganamos!")
        .searchable(text: $searchText, prompt: "Search fixes")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if session.isAuthenticated { SatsBadge(amount: session.profile?.balance ?? 0) }
                else { Button("Sign In") { session.isPresentingLogin = true } }
            }
        }
        .navigationDestination(for: GanamosPost.self) { PostDetailView(post: $0) }
        .refreshable { await model.load(token: session.accessToken) }
        .task { if model.posts.isEmpty { await model.load(token: session.accessToken) } }
    }
}

private struct PostRow: View {
    let post: GanamosPost
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            AsyncImage(url: post.imageURL) { image in image.resizable().scaledToFill() } placeholder: {
                ZStack { GanamosColor.green.opacity(0.12); Image(systemName: "wrench.and.screwdriver").foregroundStyle(GanamosColor.green) }
            }
            .frame(width: 88, height: 88).clipShape(RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 6) {
                Text(post.title?.isEmpty == false ? post.title! : post.description).font(.headline).lineLimit(2)
                if let location = post.location { Label(location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                HStack { SatsBadge(amount: post.reward); Spacer(); if let group = post.group { Text(group.name).font(.caption).foregroundStyle(.secondary) } }
            }
        }.padding(.vertical, 6)
    }
}

struct PostDetailView: View {
    let post: GanamosPost
    @Environment(SessionStore.self) private var session
    @State private var isPresentingFix = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                AsyncImage(url: post.imageURL) { image in image.resizable().scaledToFill() } placeholder: { GanamosColor.green.opacity(0.1) }
                    .frame(maxWidth: .infinity).frame(height: 280).clipped()
                VStack(alignment: .leading, spacing: 12) {
                    Text(post.title ?? "Community fix").font(.title.bold())
                    SatsBadge(amount: post.reward)
                    Text(post.description).font(.body)
                    if let location = post.location { Label(location, systemImage: "mappin.and.ellipse").foregroundStyle(.secondary) }
                    Button {
                        if session.isAuthenticated { isPresentingFix = true }
                        else { session.isPresentingLogin = true }
                    } label: { Label("I’ll fix this", systemImage: "hand.raised.fill").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                }.padding()
            }
        }
        .ignoresSafeArea(edges: .top).navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isPresentingFix) { NavigationStack { SubmitFixView(post: post) } }
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
