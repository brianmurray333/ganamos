import SwiftUI

@main
struct GanamosApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            appRoot
                .environment(session)
                .tint(GanamosColor.green)
#if DEBUG
                .task { await signInForSimulatorRegressionIfRequested() }
#endif
        }
    }

    @ViewBuilder
    private var appRoot: some View {
#if DEBUG
        if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "authentication" {
            LoginView()
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "donate" {
            NavigationStack { DonateView() }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "map" {
            NavigationStack { MapScreen(regressionPosts: RegressionFixtures.mapPosts) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "newIssuePhoto" {
            NavigationStack { NewFixView() }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "newIssueDetails" {
            NavigationStack { NewFixView() }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "postReview" {
            NavigationStack { PostDetailView(post: RegressionFixtures.reviewPost(ownerID: session.userID), regressionTreatAsOwner: true) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "postOwnerOpen" {
            NavigationStack { PostDetailView(post: RegressionFixtures.openPost(ownerID: session.userID), regressionTreatAsOwner: true) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "submitFix" {
            NavigationStack { SubmitFixView(post: RegressionFixtures.openPost(ownerID: UUID())) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "feedLoading" {
            NavigationStack { FeedView(regressionState: .loading) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "feedError" {
            NavigationStack { FeedView(regressionState: .error) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "feedEmpty" {
            NavigationStack { FeedView(regressionState: .empty) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "feedAuthenticated" {
            NavigationStack { FeedView(regressionState: .loaded(RegressionFixtures.mapPosts)) }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "feedAccountSwitcher" {
            NavigationStack { FeedView(regressionState: .loaded(RegressionFixtures.mapPosts)) }
                .task {
                    session.installRegressionAccountContext(
                        main: RegressionFixtures.profile,
                        connected: RegressionFixtures.connectedAccountProfiles)
                }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profile" {
            let profile = NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverview, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
            if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_DYNAMIC_TYPE"] == "accessibility3" {
                profile.dynamicTypeSize(.accessibility3)
            } else {
                profile
            }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileAccountSwitcher" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverview, regressionBitcoinPrice: 80_000)
            }
                .task {
                    session.installRegressionAccountContext(
                        main: RegressionFixtures.profile,
                        connected: RegressionFixtures.connectedAccountProfiles)
                }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileEmptyRelationships" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewEmptyRelationships, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileSquirrelPet" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewSquirrelPet, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileUnnamedPet" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewUnnamedPet, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileUnnamedFamilyMember" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewUnnamedFamilyMember, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileWithoutUsername" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewEmptyRelationships, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profileWithoutUsername) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileWithoutName" {
            NavigationStack {
                ProfileView(regressionOverview: RegressionFixtures.profileOverviewEmptyRelationships, regressionBitcoinPrice: 80_000)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profileWithoutName) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "profileAdmin" {
            NavigationStack {
                ProfileView(
                    regressionOverview: RegressionFixtures.profileOverview,
                    regressionBitcoinPrice: 80_000,
                    regressionShowsAdminMenu: true,
                    regressionAdminStats: RegressionFixtures.adminStats)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "accountSettings" {
            NavigationStack { AccountSettingsView(regressionProfile: RegressionFixtures.profile) }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "familyAccounts" {
            NavigationStack { FamilyAccountsView(regressionOverview: RegressionFixtures.profileOverview) }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "familyAccountsRemoval" {
            let familyAccounts = NavigationStack {
                FamilyAccountsView(regressionAccounts: RegressionFixtures.familyAccountsMixed)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
            if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_DYNAMIC_TYPE"] == "accessibility3" {
                familyAccounts.dynamicTypeSize(.accessibility3)
            } else {
                familyAccounts
            }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "familyAccountsUnnamed" {
            NavigationStack {
                FamilyAccountsView(regressionAccounts: RegressionFixtures.familyAccountsUnnamed)
            }
                .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "petHub" {
            NavigationStack { PetHubView() }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "groups" {
            NavigationStack {
                GroupsView(
                    regressionGroups: RegressionFixtures.groups,
                    regressionMembersByGroupID: RegressionFixtures.groupMembersByGroupID)
            }
            .task { session.installRegressionProfile(RegressionFixtures.profile) }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "activity" {
            NavigationStack {
                ActivityView(
                    regressionTransactions: RegressionFixtures.transactions,
                    regressionActivities: RegressionFixtures.activities,
                    regressionPostsByID: [RegressionFixtures.activityPost.id: RegressionFixtures.activityPost])
            }
        } else if ProcessInfo.processInfo.environment["GANAMOS_PREVIEW_SCREEN"] == "userPosts" {
            NavigationStack { UserPostsView(regressionPosts: RegressionFixtures.userPosts) }
        } else {
            RootView()
        }
#else
        RootView()
#endif
    }

#if DEBUG
    @MainActor
    private func signInForSimulatorRegressionIfRequested() async {
        let environment = ProcessInfo.processInfo.environment
        let arguments = ProcessInfo.processInfo.arguments
        func argument(after flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        if arguments.contains("--ganamos-reset-session") {
            session.signOut()
            return
        }
        guard !session.isAuthenticated else { return }
        if let accessToken = argument(after: "--ganamos-test-access-token"),
           let refreshToken = argument(after: "--ganamos-test-refresh-token"),
           let userIDString = argument(after: "--ganamos-test-user-id"),
           let userID = UUID(uuidString: userIDString) {
            try? session.installRegressionSession(accessToken: accessToken, refreshToken: refreshToken, userID: userID, email: argument(after: "--ganamos-test-user-email"))
            try? await session.refreshProfile()
            return
        }
        guard
              let email = environment["GANAMOS_TEST_EMAIL"] ?? argument(after: "--ganamos-test-email"),
              let password = environment["GANAMOS_TEST_PASSWORD"] ?? argument(after: "--ganamos-test-password") else { return }
        do { try await session.signIn(email: email, password: password) }
        catch { print("[Simulator regression sign-in] \(error.localizedDescription)") }
    }
#endif
}

#if DEBUG
private enum RegressionFixtures {
    static let profileID = UUID(uuidString: "00000000-0000-0000-0000-000000000101")!

    static let profile = UserProfile(
        id: profileID,
        email: "regression@ganamos.earth",
        name: "Alexandria Montgomery",
        username: "alexandria-community-builder",
        avatarURL: nil,
        balance: 27_900,
        fixedIssuesCount: 90)

    static let profileWithoutUsername = UserProfile(
        id: profileID,
        email: "regression@ganamos.earth",
        name: "Alexandria Montgomery",
        // Exercise the API edge state separately from a decoded null. Mobile
        // web treats both values as an unclaimed username.
        username: "",
        avatarURL: nil,
        balance: 27_900,
        fixedIssuesCount: 90)

    static let profileWithoutName = UserProfile(
        id: profileID,
        email: "regression@ganamos.earth",
        // Exercise the API edge state separately from a decoded null. The web
        // QR dialog treats both values as a missing display name.
        name: "",
        username: "alexandria-community-builder",
        avatarURL: nil,
        balance: 27_900,
        fixedIssuesCount: 90)

    static let profileOverview = ProfileOverview(
        postsCount: 234,
        familyMembers: [
            FamilyMember(id: UUID(uuidString: "00000000-0000-0000-0000-000000000201")!, name: "Marlowe", username: "marlowe", avatarURL: nil, balance: 60_600),
            FamilyMember(id: UUID(uuidString: "00000000-0000-0000-0000-000000000202")!, name: "Charlotte", username: "charlotte", avatarURL: nil, balance: 36_400),
            FamilyMember(id: UUID(uuidString: "00000000-0000-0000-0000-000000000203")!, name: "Brynn", username: "brynn", avatarURL: nil, balance: 19_800),
            FamilyMember(id: UUID(uuidString: "00000000-0000-0000-0000-000000000204")!, name: "Anastasia", username: "anastasia", avatarURL: nil, balance: 12_600),
            FamilyMember(id: UUID(uuidString: "00000000-0000-0000-0000-000000000205")!, name: "Kittle", username: "kittle", avatarURL: nil, balance: 7_100)
        ],
        pet: UserPet(name: "pup", type: "dog"))

    static let familyAccountsMixed: [FamilyAccount] = [
        FamilyAccount(member: profileOverview.familyMembers[0], kind: .child),
        FamilyAccount(member: profileOverview.familyMembers[1], kind: .quickContact),
    ]

    static let connectedAccountProfiles: [UserProfile] = [
        UserProfile(
            id: profileOverview.familyMembers[0].id,
            email: nil,
            name: "Marlowe",
            username: "marlowe",
            avatarURL: nil,
            balance: 60_600,
            fixedIssuesCount: 12),
        UserProfile(
            id: profileOverview.familyMembers[2].id,
            email: nil,
            name: "Brynn",
            username: "brynn",
            avatarURL: nil,
            balance: 19_800,
            fixedIssuesCount: 4),
    ]

    static let familyAccountsUnnamed: [FamilyAccount] = [
        FamilyAccount(
            member: FamilyMember(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000206")!,
                name: "",
                username: "orion",
                avatarURL: nil,
                balance: 4_200),
            kind: .child)
    ]

    static let profileOverviewEmptyRelationships = ProfileOverview(
        postsCount: 234,
        familyMembers: [])

    static let profileOverviewSquirrelPet = ProfileOverview(
        postsCount: 234,
        familyMembers: [],
        pet: UserPet(name: "Hazel", type: "squirrel"))

    static let profileOverviewUnnamedPet = ProfileOverview(
        postsCount: 234,
        familyMembers: [],
        // Mirrors a connected device whose optional personalization fields
        // decode to the mobile-web `Pet` and default-cat fallbacks.
        pet: UserPet(name: "Pet", type: ""))

    static let profileOverviewUnnamedFamilyMember = ProfileOverview(
        postsCount: 234,
        familyMembers: [
            FamilyMember(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000206")!,
                name: "",
                username: "orion",
                avatarURL: nil,
                balance: 4_200)
        ])

    static let adminStats = AdminStats(users: 1_248, posts: 3_906, transactions: 18_221, orders: 47)

    static let mapPosts = [
        GanamosPost(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000301")!,
            title: "Restore the creek trail", description: "Clear storm debris from the trail.",
            imageURL: nil, location: "Creek trail", latitude: 37.7749, longitude: -122.4194,
            reward: 500, createdAt: Date(), expiresAt: nil, group: nil, userID: profileID,
            fixed: false, underReview: false, deletedAt: nil,
            submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil),
        GanamosPost(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000302")!,
            title: "Report the broken fountain", description: "Document the damaged park fountain.",
            imageURL: nil, location: "Community park", latitude: 37.8044, longitude: -122.2712,
            reward: 0, createdAt: Date(), expiresAt: nil, group: nil, userID: profileID,
            fixed: false, underReview: false, deletedAt: nil,
            submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil)
    ]

    static let groups = [
        UserGroup(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000401")!,
            name: "Lake Merritt Neighbors",
            description: "Local cleanups and community fixes",
            memberCount: 42,
            groupCode: "LAKE",
            inviteCode: "lake-neighbors-regression",
            createdBy: profileID)
    ]

    static let groupMembersByGroupID = [
        groups[0].id: [
            GroupMember(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000411")!,
                userID: profileID,
                role: "admin",
                status: "approved",
                profile: GroupMemberProfile(name: "Alexandria Montgomery", username: "alexandria-community-builder", avatarURL: nil)),
            GroupMember(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000412")!,
                userID: UUID(uuidString: "00000000-0000-0000-0000-000000000413")!,
                role: "member",
                status: "pending",
                profile: GroupMemberProfile(name: "Jordan Lee", username: "jordan", avatarURL: nil)),
            GroupMember(
                id: UUID(uuidString: "00000000-0000-0000-0000-000000000414")!,
                userID: UUID(uuidString: "00000000-0000-0000-0000-000000000415")!,
                role: "member",
                status: "approved",
                profile: GroupMemberProfile(name: "Sam Rivera", username: "sam", avatarURL: nil))
        ]
    ]

    static let transactions = [
        WalletTransaction(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000501")!,
            type: .deposit,
            amount: 500,
            status: .completed,
            memo: "Lightning deposit",
            createdAt: Date().addingTimeInterval(-120))
    ]

    static let activityPost = GanamosPost(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000503")!,
        title: "Restore the creek trail", description: "Clear storm debris and reopen the full trail.",
        imageURL: nil, location: "Creek trail", latitude: nil, longitude: nil,
        reward: 500, createdAt: Date().addingTimeInterval(-3_600), expiresAt: nil,
        group: nil, userID: profileID, fixed: true, underReview: false, deletedAt: nil,
        submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
        submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil)

    static let activities = [
        AccountActivity(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000502")!,
            type: "fix_completed",
            relatedID: activityPost.id,
            timestamp: Date().addingTimeInterval(-60),
            metadata: ActivityMetadata(
                title: "Creek trail cleared",
                reward: 500,
                amount: nil,
                fixerName: nil,
                status: "completed"))
    ]

    static let userPosts = [
        GanamosPost(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000601")!,
            title: "Clear the creek trail", description: "Remove storm debris.",
            imageURL: nil, location: "Creek trail", latitude: nil, longitude: nil,
            reward: 500, createdAt: Date(), expiresAt: nil, group: nil, userID: profileID,
            fixed: false, underReview: false, deletedAt: nil,
            submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil),
        GanamosPost(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000602")!,
            title: "Repair the garden gate", description: "Secure the loose hinge.",
            imageURL: nil, location: "Community garden", latitude: nil, longitude: nil,
            reward: 0, createdAt: Date(), expiresAt: nil, group: nil, userID: profileID,
            fixed: true, underReview: false, deletedAt: nil,
            submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil)
    ]

    static func openPost(ownerID: UUID?) -> GanamosPost {
        GanamosPost(
            id: UUID(), title: "Clear the neighborhood trail",
            description: "Remove litter and leave the trail ready for everyone.",
            imageURL: nil, location: "Neighborhood trail", latitude: nil, longitude: nil,
            reward: 500, createdAt: Date(), expiresAt: nil, group: nil, userID: ownerID,
            fixed: false, underReview: false, deletedAt: nil,
            submittedFixByID: nil, submittedFixByName: nil, submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: nil, submittedFixProofText: nil)
    }

    static func reviewPost(ownerID: UUID?) -> GanamosPost {
        GanamosPost(
            id: UUID(), title: "Clear the neighborhood trail",
            description: "Remove litter and leave the trail ready for everyone.",
            imageURL: nil, location: "Neighborhood trail", latitude: nil, longitude: nil,
            reward: 500, createdAt: Date(), expiresAt: nil, group: nil, userID: ownerID,
            fixed: false, underReview: true, deletedAt: nil,
            submittedFixByID: UUID(), submittedFixByName: "Regression Fixer", submittedFixByAvatar: nil,
            submittedFixImageURL: nil, submittedFixNote: "All bags were removed.",
            submittedFixProofText: "Cleaned the full trail and sorted recyclables." )
    }
}
#endif
