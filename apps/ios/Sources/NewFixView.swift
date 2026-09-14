@preconcurrency import AVFoundation
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
    private let cancelCamera: () -> Void
    @State private var step: Step = .photo
    @State private var photoItem: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var cameraAuthorized: Bool?
    @State private var description = ""
    @State private var location = ""
    @State private var latitude: Double?
    @State private var longitude: Double?
    @State private var isPresentingLocationEditor = false
    @State private var audience: Audience = .publicPost
    @State private var groups: [UserGroup] = []
    @State private var people: [FamilyMember] = []
    @State private var bitcoinPrice: Double?
    @State private var reward = 2_000
    @State private var isLocating = false
    @State private var locationRequestGeneration = 0
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var cameraError: String?
    @State private var navigateToPost: GanamosPost?
    @FocusState private var isDescriptionFocused: Bool

    init(cancelCamera: @escaping () -> Void = {}) {
        self.cancelCamera = cancelCamera
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        let showDetails = arguments.contains("--ganamos-new-issue-details")
        let disableAutomaticCamera = arguments.contains("--ganamos-disable-auto-camera")
        _step = State(initialValue: showDetails ? .details : .photo)
        _cameraAuthorized = State(initialValue: showDetails || disableAutomaticCamera ? false : nil)
        if arguments.contains("--ganamos-camera-denied") {
            _cameraAuthorized = State(initialValue: false)
            _cameraError = State(initialValue: "Camera access is unavailable. Choose a photo from your library instead.")
        }
        if showDetails {
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: 900, height: 540))
            let image = renderer.image { context in
                UIColor(red: 0.04, green: 0.12, blue: 0.10, alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 0, width: 900, height: 540))
                UIColor(red: 0.14, green: 0.29, blue: 0.23, alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 310, width: 900, height: 230))
                UIColor(red: 0.35, green: 0.40, blue: 0.36, alpha: 1).setFill()
                context.fill(CGRect(x: 330, y: 0, width: 240, height: 540))
            }
            _photoData = State(initialValue: image.jpegData(compressionQuality: 0.82))
            _location = State(initialValue: "San Francisco, CA")
            _bitcoinPrice = State(initialValue: 76_500)
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
        .toolbar(step == .photo ? .hidden : .visible, for: .tabBar)
        .onChange(of: photoItem) { _, item in
            Task {
                guard let data = try? await item?.loadTransferable(type: Data.self),
                      UIImage(data: data) != nil else { return }
                photoItem = nil
                photoData = data
                step = .details
                await useCurrentLocation()
            }
        }
        .navigationDestination(item: $navigateToPost) { post in
            PostDetailView(post: post)
        }
        .sheet(isPresented: $isPresentingLocationEditor) { locationEditor }
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
#if DEBUG
            if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] != "newIssueDetails" {
                bitcoinPrice = try? await price
            }
#else
            bitcoinPrice = try? await price
#endif
        }
    }

    private var photoStep: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if cameraAuthorized == true {
                DirectIssueCameraPicker(
                    completion: acceptCameraImage
                )
                .ignoresSafeArea()
            }

            cameraOverlay
        }
        .task { await resolveCameraAuthorization() }
    }

    @MainActor
    private func resolveCameraAuthorization() async {
        guard cameraAuthorized == nil else { return }
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
            cameraAuthorized = false
            return
        }
        cameraError = nil
        cameraAuthorized = true
    }

    private var cameraOverlay: some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                Text("Take a photo of the issue")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .frame(height: 40)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.top, 14)
                    .accessibilityIdentifier("issueCameraInstruction")

                Spacer()

                if let cameraError {
                    Label(cameraError, systemImage: "camera.fill.badge.exclamationmark")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.bottom, 18)
                        .accessibilityIdentifier("newIssueCameraError")
                }

                HStack {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(.black.opacity(0.48), in: Circle())
                            .overlay(Circle().stroke(.white.opacity(0.2)))
                    }
                    .accessibilityLabel("Choose from Photos")
                    .accessibilityIdentifier("issueCameraPhotos")

                    Spacer()

                    Button {
                        photoItem = nil
                        photoData = nil
                        step = .details
                    } label: {
                        Text("Skip")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(.black.opacity(0.48), in: Circle())
                            .overlay(Circle().stroke(.white.opacity(0.2)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Continue without photo")
                    .accessibilityIdentifier("issueCameraSkip")
                }
                .frame(height: 68)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }

            Button(action: cancelCamera) {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.black.opacity(0.48), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.2)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close camera")
            .accessibilityIdentifier("issueCameraClose")
            .padding(.top, 12)
            .padding(.trailing, 18)
        }
    }

    private func acceptCameraImage(_ image: UIImage) {
        photoData = image.jpegData(compressionQuality: 0.86)
        step = .details
        Task { await useCurrentLocation() }
    }

    private func returnToPhotoStep() {
        photoItem = nil
        step = .photo
    }

    private var detailsStep: some View {
        VStack(spacing: 0) {
            photoHeader
            ScrollView {
                VStack(spacing: 18) {
                    descriptionEditor
                    audienceControl
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
                .padding(.top, 18)
                .padding(.bottom, 32)
            }
        }
        .background(Color.black)
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder private var photoHeader: some View {
        if let photoData, let image = UIImage(data: photoData) {
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 210)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                VStack {
                    HStack {
                        headerButton("chevron.left", label: "Retake", action: returnToPhotoStep)
                        Spacer()
                        headerButton("xmark", label: "Remove photo") { self.photoData = nil }
                    }
                    Spacer()
                    HStack {
                        locationPill
                        Spacer()
                    }
                }
                .padding(12)
            }
            .frame(height: 210)
            .padding(.horizontal, 20)
            .padding(.top, 12)
        } else {
            HStack {
                headerButton("chevron.left", label: "Add photo", action: returnToPhotoStep)
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
            HStack {
                locationPill
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
    }

    private var locationPill: some View {
        Button { isPresentingLocationEditor = true } label: {
            HStack(spacing: 7) {
                Image(systemName: "mappin")
                    .font(.system(size: 14, weight: .semibold))
                Text(location.isEmpty ? "Add location" : location.split(separator: ",").first.map(String.init) ?? location)
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(.black.opacity(0.62), in: Capsule())
            .overlay { Capsule().stroke(.white.opacity(0.14)) }
        }
        .accessibilityIdentifier("newIssueLocationOverlay")
    }

    private var locationEditor: some View {
        NavigationStack {
            VStack(spacing: 18) {
                TextField("City or address", text: manualLocationBinding)
                    .textContentType(.fullStreetAddress)
                    .padding(.horizontal, 15)
                    .frame(height: 54)
                    .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }

                Button { Task { await useCurrentLocation() } } label: {
                    if isLocating {
                        ProgressView().tint(.white)
                    } else {
                        Label("Use current location", systemImage: "location.fill")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(GanamosColor.green)
                .frame(maxWidth: .infinity, alignment: .leading)

                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Spacer()
            }
            .padding(20)
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { isPresentingLocationEditor = false }
                }
            }
        }
        .presentationDetents([.medium])
        .preferredColorScheme(.dark)
    }

    private var manualLocationBinding: Binding<String> {
        Binding(
            get: { location },
            set: { value in
                location = value
                latitude = nil
                longitude = nil
                locationRequestGeneration += 1
                isLocating = false
                error = nil
            }
        )
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
            .font(.body)
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

    private var rewardControl: some View {
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                rewardButton("minus") { reward = max(0, reward - 500) }
                VStack(spacing: 6) {
                    Text(compactSats(reward))
                        .font(.system(size: 36, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(.white)

                    HStack(spacing: 7) {
                        Image("BitcoinLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 22, height: 22)
                            .accessibilityElement()
                            .accessibilityLabel("Bitcoin")
                            .accessibilityIdentifier("newIssueBitcoinLogo")
                        Text("sats reward")
                            .font(.body)
                            .foregroundStyle(GanamosColor.mutedText)
                    }
                    .accessibilityElement(children: .contain)
                }
                .accessibilityElement(children: .contain)
                .frame(maxWidth: .infinity)
                rewardButton("plus") { reward = min(50_000, reward + 500) }
            }

            if let bitcoinPrice {
                Text(String(format: "$%.2f USD", Double(reward) / 100_000_000 * bitcoinPrice))
                    .font(.subheadline)
                    .foregroundStyle(GanamosColor.mutedText)
            }
        }
        .padding(.vertical, 10)
        .accessibilityIdentifier("newIssueReward")
    }

    private func compactSats(_ value: Int) -> String {
        guard value >= 1_000 else { return value.formatted() }
        let thousands = Double(value) / 1_000
        return thousands == thousands.rounded()
            ? "\(Int(thousands))k"
            : String(format: "%.1fk", thousands)
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
        locationRequestGeneration += 1
        let requestGeneration = locationRequestGeneration
        isLocating = true
        error = nil
        defer {
            if locationRequestGeneration == requestGeneration { isLocating = false }
        }
        do {
            let result = try await CurrentLocationService.location()
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(result)
            let resolvedLocation: String
            if let place = placemarks.first {
                resolvedLocation = [place.name, place.locality, place.administrativeArea]
                    .compactMap { $0 }
                    .reduce(into: [String]()) { parts, value in
                        if !parts.contains(value) { parts.append(value) }
                    }
                    .joined(separator: ", ")
            } else {
                resolvedLocation = String(
                    format: "%.5f, %.5f",
                    result.coordinate.latitude,
                    result.coordinate.longitude
                )
            }
            guard locationRequestGeneration == requestGeneration else { return }
            latitude = result.coordinate.latitude
            longitude = result.coordinate.longitude
            location = resolvedLocation
        } catch {
            guard locationRequestGeneration == requestGeneration else { return }
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
                expiresAt: nil,
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
                expiresAt: nil,
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
        photoItem = nil
        photoData = nil
        description = ""
        location = ""
        latitude = nil
        longitude = nil
        locationRequestGeneration += 1
        isLocating = false
        audience = .publicPost
        reward = 2_000
    }
}

struct DirectIssueCameraPicker: UIViewControllerRepresentable {
    let completion: (UIImage) -> Void

    func makeUIViewController(context: Context) -> DirectIssueCameraViewController {
        DirectIssueCameraViewController(completion: completion)
    }

    func updateUIViewController(_ uiViewController: DirectIssueCameraViewController, context: Context) {}
}

final class DirectIssueCameraViewController: UIViewController, @preconcurrency AVCapturePhotoCaptureDelegate {
    private let captureSession = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "earth.ganamos.issue-camera.session", qos: .userInitiated)
    private let completion: (UIImage) -> Void
    private let shutterButton = UIButton(type: .custom)
    private let cameraErrorLabel = UILabel()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var didCapture = false
    private var supportsAutoFlash = false
    private var cameraConfigured = false
    private var isCameraVisible = false
    private var isSessionInterrupted = false
    private var sessionGeneration = 0
    private var activeCaptureGeneration: Int?
    private var activeCaptureID: Int64?

    init(completion: @escaping (UIImage) -> Void) {
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureControls()
        configureCamera()
        observeSessionLifecycle()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        isCameraVisible = false
        activeCaptureGeneration = nil
        activeCaptureID = nil
        didCapture = false
        sessionGeneration += 1
        shutterButton.isEnabled = false
        shutterButton.alpha = 0.45
        let session = captureSession
        sessionQueue.async {
            if session.isRunning { session.stopRunning() }
        }
    }

    private func configureCamera() {
        let session = captureSession
        let output = photoOutput
        let configuration = sessionQueue.sync { () -> (configured: Bool, supportsAutoFlash: Bool) in
            session.beginConfiguration()
            session.sessionPreset = .photo
            defer { session.commitConfiguration() }

            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input),
                session.canAddOutput(output)
            else { return (false, false) }

            session.addInput(input)
            session.addOutput(output)
            return (true, device.hasFlash && output.supportedFlashModes.contains(.auto))
        }

        guard configuration.configured else {
            cameraErrorLabel.text = "Camera is unavailable."
            cameraErrorLabel.isHidden = false
            return
        }

        cameraConfigured = true
        supportsAutoFlash = configuration.supportsAutoFlash

        let layer = AVCaptureVideoPreviewLayer(session: captureSession)
        layer.videoGravity = .resizeAspectFill
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer
    }

    private func observeSessionLifecycle() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(cameraSessionWasInterrupted),
            name: AVCaptureSession.wasInterruptedNotification,
            object: captureSession
        )
        center.addObserver(
            self,
            selector: #selector(cameraSessionInterruptionEnded),
            name: AVCaptureSession.interruptionEndedNotification,
            object: captureSession
        )
        center.addObserver(
            self,
            selector: #selector(cameraSessionRuntimeError),
            name: AVCaptureSession.runtimeErrorNotification,
            object: captureSession
        )
    }

    @objc private func cameraSessionWasInterrupted(_ notification: Notification) {
        showCameraError("Camera paused. Close and try again.")
    }

    @objc private func cameraSessionInterruptionEnded(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isCameraVisible else { return }
            self.isSessionInterrupted = false
            self.sessionGeneration += 1
            self.startSession()
        }
    }

    @objc private func cameraSessionRuntimeError(_ notification: Notification) {
        showCameraError("Camera stopped. Close and try again.")
    }

    private func showCameraError(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.isSessionInterrupted = true
            self.sessionGeneration += 1
            self.activeCaptureGeneration = nil
            self.activeCaptureID = nil
            self.didCapture = false
            self.shutterButton.isEnabled = false
            self.shutterButton.alpha = 0.45
            self.cameraErrorLabel.text = message
            self.cameraErrorLabel.isHidden = false
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        isCameraVisible = true
        isSessionInterrupted = false
        sessionGeneration += 1
        startSession()
    }

    private func startSession() {
        guard cameraConfigured, isCameraVisible, !isSessionInterrupted else { return }
        let generation = sessionGeneration
        let session = captureSession
        sessionQueue.async { [weak self] in
            if !session.isRunning { session.startRunning() }
            let isRunning = session.isRunning
            DispatchQueue.main.async {
                guard
                    let self,
                    self.isCameraVisible,
                    self.sessionGeneration == generation
                else { return }
                self.shutterButton.isEnabled = isRunning
                self.shutterButton.alpha = isRunning ? 1 : 0.45
                if isRunning {
                    self.cameraErrorLabel.isHidden = true
                } else {
                    self.cameraErrorLabel.text = "Camera couldn't start. Close and try again."
                    self.cameraErrorLabel.isHidden = false
                }
            }
        }
    }

    private func configureControls() {
        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 34
        shutterButton.layer.borderWidth = 5
        shutterButton.layer.borderColor = UIColor.white.withAlphaComponent(0.42).cgColor
        shutterButton.accessibilityLabel = "Take photo"
        shutterButton.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)
        shutterButton.isEnabled = false
        shutterButton.alpha = 0.45

        cameraErrorLabel.textColor = .white
        cameraErrorLabel.font = .preferredFont(forTextStyle: .subheadline)
        cameraErrorLabel.textAlignment = .center
        cameraErrorLabel.numberOfLines = 0
        cameraErrorLabel.text = "Couldn't take photo. Try again."
        cameraErrorLabel.isHidden = true
        cameraErrorLabel.accessibilityIdentifier = "issueCameraCaptureError"

        for control in [shutterButton, cameraErrorLabel] {
            control.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(control)
        }

        NSLayoutConstraint.activate([
            shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            shutterButton.widthAnchor.constraint(equalToConstant: 68),
            shutterButton.heightAnchor.constraint(equalToConstant: 68),
            cameraErrorLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            cameraErrorLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            cameraErrorLabel.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -18),
        ])
    }


    @objc private func takePhoto() {
        guard isCameraVisible, shutterButton.isEnabled, captureSession.isRunning, !didCapture else { return }
        didCapture = true
        shutterButton.isEnabled = false
        shutterButton.alpha = 0.45
        cameraErrorLabel.isHidden = true
        let settings = AVCapturePhotoSettings()
        settings.flashMode = supportsAutoFlash ? .auto : .off
        activeCaptureGeneration = sessionGeneration
        activeCaptureID = settings.uniqueID
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        let captureID = photo.resolvedSettings.uniqueID
        let image: UIImage?
        if error == nil, let data = photo.fileDataRepresentation() {
            image = UIImage(data: data)
        } else {
            image = nil
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard
                self.isCameraVisible,
                self.activeCaptureGeneration == self.sessionGeneration,
                self.activeCaptureID == captureID
            else { return }
            self.activeCaptureGeneration = nil
            self.activeCaptureID = nil

            guard let image else {
                self.didCapture = false
                self.shutterButton.isEnabled = !self.isSessionInterrupted && self.captureSession.isRunning
                self.shutterButton.alpha = self.shutterButton.isEnabled ? 1 : 0.45
                self.cameraErrorLabel.text = "Couldn't take photo. Try again."
                self.cameraErrorLabel.isHidden = false
                return
            }
            self.completion(image)
        }
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
