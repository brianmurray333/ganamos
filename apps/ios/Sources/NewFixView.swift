import AVFoundation
import CoreLocation
import PhotosUI
import SwiftUI
import UIKit

struct NewFixView: View {
    private enum Step { case photo, details }

    private enum Audience: Hashable {
        case publicPost
        case group(UserGroup)
        case person(FamilyMember)

        var title: String {
            switch self {
            case .publicPost: "Public"
            case let .group(group): group.name
            case let .person(person): person.name ?? person.username ?? "Ganamos member"
            }
        }

        var subtitle: String {
            switch self {
            case .publicPost: "Anyone can see this job"
            case .group: "Group members only"
            case let .person(person): "@\(person.username ?? "member") · Private"
            }
        }

        var icon: String {
            switch self {
            case .publicPost: "globe.americas.fill"
            case .group: "person.3.fill"
            case .person: "person.crop.circle.fill"
            }
        }
    }

    @Environment(SessionStore.self) private var session
    @State private var step: Step = .photo
    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var isShowingCamera = false
    @State private var hasAttemptedAutomaticCamera = false
    @State private var description = ""
    @State private var location = ""
    @State private var latitude: Double?
    @State private var longitude: Double?
    @State private var audience: Audience = .publicPost
    @State private var groups: [UserGroup] = []
    @State private var people: [FamilyMember] = []
    @State private var bitcoinPrice: Double?
    @State private var reward = 2_000
    @State private var expiresAt: Date?
    @State private var isLocating = false
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var cameraError: String?
    @State private var navigateToPost: GanamosPost?
    @FocusState private var isDescriptionFocused: Bool

    init() {
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        let showDetails = arguments.contains("--ganamos-new-issue-details")
        let disableAutomaticCamera = arguments.contains("--ganamos-disable-auto-camera")
        _step = State(initialValue: showDetails ? .details : .photo)
        _hasAttemptedAutomaticCamera = State(initialValue: showDetails || disableAutomaticCamera)
        if arguments.contains("--ganamos-camera-denied") {
            _cameraError = State(initialValue: "Camera access is unavailable. Choose a photo from your library instead.")
        }
#endif
    }

    var body: some View {
        Group {
            switch step {
            case .photo: photoStep
            case .details: detailsStep
            }
        }
        .background(Color.black.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { image in
                photoData = image.jpegData(compressionQuality: 0.86)
                step = .details
                Task { await useCurrentLocation() }
            }
            .ignoresSafeArea()
        }
        .onChange(of: photoItem) { _, item in
            Task {
                guard let data = try? await item?.loadTransferable(type: Data.self) else { return }
                photoData = data
                step = .details
            }
        }
        .navigationDestination(item: $navigateToPost) { post in
            PostDetailView(post: post)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { isDescriptionFocused = false }
                    .accessibilityLabel("Dismiss keyboard")
            }
        }
        .task {
            async let audienceOptions: Void = loadAudienceOptions()
            async let price = APIClient.shared.bitcoinPrice()
            _ = await audienceOptions
            bitcoinPrice = try? await price
        }
    }

    private var photoStep: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, GanamosColor.canvas.opacity(0.9)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Text("Take photo of the issue")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.78))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.top, 18)

                Spacer()

                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 72, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.2))
                    .accessibilityHidden(true)

                Spacer()

                VStack(spacing: 14) {
                    Button {
                        Task { await openCamera() }
                    } label: {
                        Label("Take Photo", systemImage: "camera.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 54)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(GanamosColor.green)
                    .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))

                    if let cameraError {
                        Label(cameraError, systemImage: "camera.fill.badge.exclamationmark")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier("newIssueCameraError")
                    }

                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label("Choose from Photos", systemImage: "photo.on.rectangle")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(GanamosColor.border)
                            }
                    }

                    Button("Skip photo") { step = .details }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(GanamosColor.mutedText)
                        .frame(height: 42)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 26)
            }
        }
        .onAppear {
            guard !hasAttemptedAutomaticCamera else { return }
            hasAttemptedAutomaticCamera = true
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return }
            Task { await openCamera() }
        }
    }

    @MainActor
    private func openCamera() async {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return }
        let authorized: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            authorized = true
        case .notDetermined:
            authorized = await AVCaptureDevice.requestAccess(for: .video)
        case .denied, .restricted:
            authorized = false
        @unknown default:
            authorized = false
        }
        guard authorized else {
            cameraError = "Camera access is unavailable. Choose a photo from your library instead."
            return
        }
        cameraError = nil
        isShowingCamera = true
    }

    private var detailsStep: some View {
        VStack(spacing: 0) {
            photoHeader
            ScrollView {
                VStack(spacing: 22) {
                    descriptionEditor
                    audienceControl
                    locationControl
                    deadlineControl
                    rewardControl

                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button { Task { await submit() } } label: {
                        Group {
                            if isSubmitting { ProgressView().tint(.black) }
                            else { Text("Post") }
                        }
                        .font(.headline)
                        .foregroundStyle(canSubmit ? .black : GanamosColor.mutedText)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(canSubmit ? GanamosColor.green : GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay {
                            if !canSubmit {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(GanamosColor.border)
                            }
                        }
                    }
                    .disabled(!canSubmit)
                }
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 32)
            }
        }
        .background(Color.black)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var photoHeader: some View {
        if let photoData, let image = UIImage(data: photoData) {
            ZStack(alignment: .top) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 230)
                    .clipped()

                HStack {
                    headerButton("chevron.left", label: "Retake") { step = .photo }
                    Spacer()
                    headerButton("xmark", label: "Remove photo") { self.photoData = nil }
                }
                .padding(14)
            }
        } else {
            HStack {
                headerButton("chevron.left", label: "Add photo") { step = .photo }
                Spacer()
                Color.clear.frame(width: 42, height: 42)
            }
            .overlay {
                Text("New issue")
                    .font(.headline)
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
    }

    private func headerButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(.ultraThinMaterial, in: Circle())
        }
        .accessibilityLabel(label)
    }

    private var descriptionEditor: some View {
        TextField(
            "",
            text: $description,
            prompt: Text("Describe the issue…").foregroundStyle(GanamosColor.mutedText),
            axis: .vertical
        )
            .accessibilityIdentifier("newIssueDescription")
            .focused($isDescriptionFocused)
            .submitLabel(.done)
            .onSubmit { isDescriptionFocused = false }
            .font(.title3)
            .foregroundStyle(.white)
            .lineLimit(3...5)
            .padding(16)
            .frame(minHeight: 104, alignment: .topLeading)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(description.isEmpty ? GanamosColor.border : GanamosColor.green.opacity(0.75), lineWidth: description.isEmpty ? 1 : 2)
            }
    }

    private var audienceControl: some View {
        Menu {
                Button { audience = .publicPost } label: {
                    Label("Public — anyone can see this job", systemImage: "globe.americas.fill")
                }

                if !groups.isEmpty {
                    Section("Groups") {
                        ForEach(groups) { group in
                            Button { audience = .group(group) } label: {
                                Label(group.name, systemImage: "person.3.fill")
                            }
                        }
                    }
                }

                if !people.isEmpty {
                    Section("People") {
                        ForEach(people) { person in
                            Button { audience = .person(person) } label: {
                                Label(person.name ?? person.username ?? "Member", systemImage: "person.crop.circle")
                            }
                        }
                    }
                }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: audience.icon)
                    .foregroundStyle(audienceColor)
                    .frame(width: 24)
                Text(audience.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GanamosColor.mutedText)
            }
            .padding(.horizontal, 15)
            .frame(height: 54)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }
        }
    }

    private var audienceColor: Color {
        switch audience {
        case .publicPost: GanamosColor.green
        case .group: .orange
        case .person: .purple
        }
    }

    private var locationControl: some View {
        HStack(spacing: 10) {
            Image(systemName: "location.fill")
                .foregroundStyle(location.isEmpty ? GanamosColor.mutedText : GanamosColor.green)
            TextField(
                "",
                text: $location,
                prompt: Text("Add location").foregroundStyle(GanamosColor.mutedText)
            )
                .foregroundStyle(.white)
                .textContentType(.fullStreetAddress)
            Button { Task { await useCurrentLocation() } } label: {
                if isLocating { ProgressView().controlSize(.small).tint(GanamosColor.green) }
                else { Image(systemName: "location.circle") }
            }
            .foregroundStyle(GanamosColor.green)
            .accessibilityLabel("Use current location")
        }
        .padding(.horizontal, 15)
        .frame(height: 54)
        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }
        .accessibilityIdentifier("newIssueLocation")
    }

    private var deadlineControl: some View {
        Menu {
            deadlineButton("1 hour", hours: 1)
            deadlineButton("12 hours", hours: 12)
            deadlineButton("1 day", hours: 24)
            deadlineButton("3 days", hours: 72)
            deadlineButton("7 days", hours: 168)

            if expiresAt != nil {
                Divider()
                Button("Remove deadline", role: .destructive) { expiresAt = nil }
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "timer")
                    .foregroundStyle(expiresAt == nil ? GanamosColor.mutedText : GanamosColor.green)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Deadline")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                    Text(deadlineSubtitle)
                        .font(.caption)
                        .foregroundStyle(GanamosColor.mutedText)
                }
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GanamosColor.mutedText)
            }
            .padding(.horizontal, 15)
            .frame(height: 58)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }
        }
        .accessibilityIdentifier("newIssueDeadline")
    }

    private func deadlineButton(_ label: String, hours: Double) -> some View {
        Button(label) { expiresAt = Date().addingTimeInterval(hours * 3_600) }
    }

    private var deadlineSubtitle: String {
        guard let expiresAt else { return "No deadline" }
        return "Expires \(expiresAt.formatted(date: .abbreviated, time: .shortened))"
    }

    private var rewardControl: some View {
        VStack(spacing: 8) {
            Text("Reward")
                .font(.caption.weight(.semibold))
                .foregroundStyle(GanamosColor.mutedText)

            HStack(spacing: 14) {
                rewardButton("minus") { reward = max(0, reward - 500) }
                VStack(spacing: 4) {
                    Text(reward.formatted())
                        .font(.system(size: 48, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                    HStack(spacing: 6) {
                        Image(systemName: "bitcoinsign.circle.fill")
                            .foregroundStyle(.orange)
                        Text("sats reward")
                            .foregroundStyle(GanamosColor.mutedText)
                    }
                    .font(.subheadline)
                }
                .frame(maxWidth: .infinity)
                rewardButton("plus") { reward = min(50_000, reward + 500) }
            }

            if let balance = session.profile?.balance {
                Text("\(balance.formatted()) sats available")
                    .font(.caption)
                    .foregroundStyle(reward > balance ? .red : GanamosColor.mutedText)
            }

            if let bitcoinPrice {
                Text(String(format: "$%.2f USD", Double(reward) / 100_000_000 * bitcoinPrice))
                    .font(.subheadline)
                    .foregroundStyle(GanamosColor.mutedText)
            }
        }
        .padding(.vertical, 8)
        .accessibilityIdentifier("newIssueReward")
    }

    private func rewardButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(GanamosColor.surface, in: Circle())
                .overlay { Circle().stroke(GanamosColor.border) }
        }
        .accessibilityLabel(icon == "minus" ? "Decrease reward" : "Increase reward")
    }

    private func loadAudienceOptions() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        async let groupRequest = APIClient.shared.userGroups(accessToken: token, userID: userID)
        async let peopleRequest = APIClient.shared.postAudiencePeople(accessToken: token, userID: userID)
        groups = (try? await groupRequest) ?? []
        people = (try? await peopleRequest) ?? []
    }

    private func useCurrentLocation() async {
        isLocating = true
        defer { isLocating = false }
        do {
            let result = try await CurrentLocationService.location()
            latitude = result.coordinate.latitude
            longitude = result.coordinate.longitude
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(result)
            if let place = placemarks.first {
                location = [place.name, place.locality, place.administrativeArea]
                    .compactMap { $0 }
                    .reduce(into: [String]()) { parts, value in
                        if !parts.contains(value) { parts.append(value) }
                    }
                    .joined(separator: ", ")
            }
        } catch {
            self.error = "Location is unavailable. You can enter it manually."
        }
    }

    private func submit() async {
        guard session.isAuthenticated, let token = session.accessToken, let userID = session.userID else {
            session.authPresentation = .login
            session.isPresentingLogin = true
            return
        }

        let cleanDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDescription.isEmpty else { return }
        if let balance = session.profile?.balance, reward > balance {
            error = "Your reward is higher than your available balance."
            return
        }

        isSubmitting = true
        error = nil
        defer { isSubmitting = false }

        do {
            var imageURL: URL?
            if let photoData {
                imageURL = try await APIClient.shared.uploadPostImage(photoData, accessToken: token, userID: userID, folder: "posts")
            }
            let result = try await APIClient.shared.createPost(
                title: String(cleanDescription.prefix(50)),
                description: cleanDescription,
                location: location.isEmpty ? nil : location,
                latitude: latitude,
                longitude: longitude,
                imageURL: imageURL,
                reward: reward,
                groupID: groupID,
                assignedTo: assignedTo,
                expiresAt: expiresAt,
                accessToken: token,
                userID: userID,
                profile: session.profile
            )
            try await session.refreshProfile()
            navigateToPost = GanamosPost(
                id: result.postID,
                title: String(cleanDescription.prefix(50)),
                description: cleanDescription,
                imageURL: imageURL,
                location: location.isEmpty ? nil : location,
                latitude: latitude,
                longitude: longitude,
                reward: reward,
                createdAt: Date(),
                expiresAt: expiresAt,
                group: selectedPostGroup,
                userID: userID,
                fixed: false,
                underReview: false,
                deletedAt: nil,
                submittedFixByID: nil,
                submittedFixByName: nil,
                submittedFixByAvatar: nil,
                submittedFixImageURL: nil,
                submittedFixNote: nil,
                submittedFixProofText: nil
            )
            resetComposer()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private var groupID: UUID? {
        if case let .group(group) = audience { group.id } else { nil }
    }

    private var canSubmit: Bool {
        !isSubmitting && !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var assignedTo: UUID? {
        if case let .person(person) = audience { person.id } else { nil }
    }

    private var selectedPostGroup: PostGroup? {
        if case let .group(group) = audience {
            PostGroup(id: group.id, name: group.name, description: group.description)
        } else { nil }
    }

    private func resetComposer() {
        step = .photo
        hasAttemptedAutomaticCamera = false
        photoItem = nil
        photoData = nil
        description = ""
        location = ""
        latitude = nil
        longitude = nil
        audience = .publicPost
        reward = 2_000
        expiresAt = nil
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    @Environment(\.dismiss) private var dismiss
    let completion: (UIImage) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(parent: CameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage { parent.completion(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

private enum CurrentLocationService {
    static func location() async throws -> CLLocation {
        let manager = CLLocationManager()
        guard CLLocationManager.locationServicesEnabled() else {
            throw CLError(.denied)
        }

        manager.requestWhenInUseAuthorization()
        while manager.authorizationStatus == .notDetermined {
            try await Task.sleep(for: .milliseconds(100))
        }

        guard manager.authorizationStatus == .authorizedWhenInUse ||
                manager.authorizationStatus == .authorizedAlways else {
            throw CLError(.denied)
        }

        for try await update in CLLocationUpdate.liveUpdates() {
            if let location = update.location { return location }
        }
        throw CLError(.locationUnknown)
    }
}
