import PhotosUI
import SwiftUI
import UIKit

private struct ProfilePage<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            ScrollView {
                content
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(GanamosColor.surface, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .preferredColorScheme(.dark)
    }
}

private struct ProfileSurface<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(GanamosColor.border))
    }
}

struct AccountSettingsView: View {
    @Environment(SessionStore.self) private var session
    @State private var name: String
    @State private var username: String
    @State private var isSaving = false
    @State private var message: String?
    @State private var avatarItem: PhotosPickerItem?
    @State private var avatarData: Data?
    @State private var isShowingCamera = false
    @AppStorage("ganamosFeedSort") private var feedSort = "Recent"
    private let regressionProfile: UserProfile?

    init(regressionProfile: UserProfile? = nil) {
        self.regressionProfile = regressionProfile
        _name = State(initialValue: regressionProfile?.name ?? "")
        _username = State(initialValue: regressionProfile?.username ?? "")
    }

    var body: some View {
        ProfilePage(title: "Account settings") {
            VStack(spacing: 16) {
                ProfileSurface {
                    VStack(alignment: .leading, spacing: 18) {
                        avatarEditor
                        field("Name", text: $name, prompt: "Your name")
                        field("Username", text: $username, prompt: "username", prefix: "@")
                        Text("Only lowercase letters, numbers, and hyphens")
                            .font(.caption).foregroundStyle(GanamosColor.mutedText)
                        if hasChanges {
                            Button { Task { await save() } } label: {
                                Group { if isSaving { ProgressView() } else { Text("Save Changes") } }
                                    .fontWeight(.semibold).frame(maxWidth: .infinity).frame(height: 44)
                            }
                            .buttonStyle(.borderedProminent).tint(GanamosColor.green)
                            .disabled(isSaving || !isValid)
                            .accessibilityIdentifier("accountSaveChanges")
                        }
                        if let message { Text(message).font(.caption).foregroundStyle(message == "Settings saved" ? GanamosColor.green : .red) }
                    }
                }
                ProfileSurface {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Default feed sort").font(.subheadline.weight(.semibold))
                        Picker("Default feed sort", selection: $feedSort) {
                            ForEach(["Recent", "Nearby", "Reward"], id: \.self) { Text($0).tag($0) }
                        }.pickerStyle(.segmented)
                    }
                }
            }
        }
        .onAppear {
            guard regressionProfile == nil else { return }
            name = session.profile?.name ?? ""
            username = session.profile?.username ?? ""
        }
        .onChange(of: avatarItem) { _, item in Task { avatarData = try? await item?.loadTransferable(type: Data.self) } }
        .fullScreenCover(isPresented: $isShowingCamera) {
            CameraPicker { image in avatarData = image.jpegData(compressionQuality: 0.82) }.ignoresSafeArea()
        }
    }

    private var baselineProfile: UserProfile? { regressionProfile ?? session.profile }
    private var hasChanges: Bool { avatarData != nil || name != (baselineProfile?.name ?? "") || username != (baselineProfile?.username ?? "") }
    private var isValid: Bool { name.trimmingCharacters(in: .whitespaces).count >= 2 && username.range(of: "^[a-z0-9-]{3,}$", options: .regularExpression) != nil }
    private func field(_ label: String, text: Binding<String>, prompt: String, prefix: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(GanamosColor.mutedText)
            HStack {
                if let prefix { Text(prefix).foregroundStyle(GanamosColor.mutedText) }
                TextField(prompt, text: text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier(label == "Name" ? "accountName" : "accountUsername")
            }
                .padding(.horizontal, 14).frame(height: 46).background(GanamosColor.canvas, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
        }
    }
    private var avatarEditor: some View {
        VStack(spacing: 14) {
            Group {
                if let avatarData, let image = UIImage(data: avatarData) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    AsyncImage(url: session.profile?.avatarURL) { $0.resizable().scaledToFill() } placeholder: {
                        Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(GanamosColor.green)
                    }
                }
            }
            .frame(width: 104, height: 104)
            .clipShape(Circle())
            .overlay(Circle().stroke(GanamosColor.border, lineWidth: 2))
            HStack(spacing: 10) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Camera", systemImage: "camera") { isShowingCamera = true }.buttonStyle(.bordered)
                }
                PhotosPicker(selection: $avatarItem, matching: .images) { Label("Photo Library", systemImage: "photo") }
                    .buttonStyle(.bordered)
            }
            .tint(GanamosColor.green)
        }
        .frame(maxWidth: .infinity)
    }
    private func save() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        isSaving = true; message = nil
        do {
            let avatarURL = avatarData.map { "data:image/jpeg;base64,\($0.base64EncodedString())" }
            try await APIClient.shared.updateProfile(name: name.trimmingCharacters(in: .whitespaces), username: username.lowercased(), avatarURL: avatarURL, accessToken: token, userID: userID)
            try await session.refreshProfile(); message = "Settings saved"
            avatarData = nil
        } catch { message = error.localizedDescription }
        isSaving = false
    }
}

struct GroupsView: View {
    @Environment(SessionStore.self) private var session
    @State private var groups: [UserGroup] = []
    @State private var isLoading = true
    @State private var isShowingCreate = false
    @State private var isShowingSearch = false
    private let isRegressionState: Bool
    private let regressionMembersByGroupID: [UUID: [GroupMember]]

    init(
        regressionGroups: [UserGroup]? = nil,
        regressionMembersByGroupID: [UUID: [GroupMember]] = [:]
    ) {
        _groups = State(initialValue: regressionGroups ?? [])
        _isLoading = State(initialValue: regressionGroups == nil)
        isRegressionState = regressionGroups != nil
        self.regressionMembersByGroupID = regressionMembersByGroupID
    }

    var body: some View {
        ProfilePage(title: "Groups") {
            VStack(spacing: 16) {
                Button { isShowingSearch = true } label: {
                    Label("Find a group...", systemImage: "magnifyingglass")
                        .foregroundStyle(GanamosColor.mutedText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .frame(height: 48)
                        .background(GanamosColor.surface, in: Capsule())
                        .overlay(Capsule().stroke(GanamosColor.border))
                }
                .buttonStyle(.plain)

                Button { isShowingCreate = true } label: {
                    Label("Create Group", systemImage: "plus")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(GanamosColor.green)

                if isLoading { ProgressView().padding(.top, 60) }
                else if groups.isEmpty { EmptyState(icon: "person.2", title: "No groups yet", message: "Find a group or create one for your community.") }
                else {
                    ForEach(groups) { group in
                        NavigationLink {
                            GroupDetailView(
                                group: group,
                                regressionMembers: regressionMembersByGroupID[group.id])
                        } label: {
                            ProfileSurface {
                                HStack(spacing: 14) {
                                    Circle()
                                        .fill(GanamosColor.green.opacity(0.14))
                                        .frame(width: 46, height: 46)
                                        .overlay(Image(systemName: "person.3.fill").foregroundStyle(GanamosColor.green))
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(group.name).font(.headline)
                                        Text(group.description ?? "Community group")
                                            .font(.subheadline)
                                            .foregroundStyle(GanamosColor.mutedText)
                                            .lineLimit(2)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").foregroundStyle(GanamosColor.mutedText)
                                }
                            }
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("group-\(group.id.uuidString.lowercased())")
                    }
                }
            }
        }
        .sheet(isPresented: $isShowingCreate) {
            CreateGroupSheet { group in
                groups.insert(group, at: 0)
                isShowingCreate = false
            }
        }
        .sheet(isPresented: $isShowingSearch) { FindGroupSheet() }
        .task { if !isRegressionState { await load() } }
    }
    private func load() async { defer { isLoading = false }; guard let token = session.accessToken, let id = session.userID else { return }; groups = (try? await APIClient.shared.userGroups(accessToken: token, userID: id)) ?? [] }
}

private struct CreateGroupSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var groupDescription = ""
    @State private var isCreating = false
    @State private var error: String?
    let completion: (UserGroup) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Group") {
                    TextField("Group name", text: $name)
                    TextField("What is this group for?", text: $groupDescription, axis: .vertical)
                        .lineLimit(3...6)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .scrollContentBackground(.hidden)
            .background(GanamosColor.canvas)
            .navigationTitle("Create Group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isCreating ? "Creating…" : "Create") { Task { await create() } }
                        .disabled(isCreating || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func create() async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        isCreating = true
        defer { isCreating = false }
        do {
            let group = try await APIClient.shared.createGroup(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                description: groupDescription.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                accessToken: token,
                userID: userID
            )
            completion(group)
        } catch { self.error = error.localizedDescription }
    }
}

private struct FindGroupSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var result: UserGroup?
    @State private var message: String?
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            ZStack {
                GanamosColor.canvas.ignoresSafeArea()
                VStack(spacing: 20) {
                    Text("Enter the 4-character group code")
                        .font(.subheadline)
                        .foregroundStyle(GanamosColor.mutedText)
                    TextField("ABCD", text: $code)
                        .font(.system(size: 30, weight: .semibold, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .padding()
                        .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border))
                        .onChange(of: code) { _, value in
                            code = String(value.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(4))
                            result = nil
                            message = nil
                        }
                    Button("Find Group") { Task { await search() } }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .tint(GanamosColor.green)
                        .disabled(code.count != 4 || isWorking)

                    if let result {
                        ProfileSurface {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(result.name).font(.title3.bold())
                                Text(result.description ?? "Community group").foregroundStyle(GanamosColor.mutedText)
                                Button("Request to Join") { Task { await join(result) } }
                                    .buttonStyle(.borderedProminent)
                                    .tint(GanamosColor.green)
                            }
                        }
                    }
                    if let message { Text(message).font(.footnote).foregroundStyle(message == "Request sent" ? GanamosColor.green : .red) }
                    Spacer()
                }
                .padding(22)
            }
            .navigationTitle("Find Groups")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
        .preferredColorScheme(.dark)
    }

    private func search() async {
        guard let token = session.accessToken else { return }
        isWorking = true; defer { isWorking = false }
        do {
            result = try await APIClient.shared.findGroup(code: code, accessToken: token)
            if result == nil { message = "Group not found. Check the code and try again." }
        } catch { message = error.localizedDescription }
    }

    private func join(_ group: UserGroup) async {
        guard let token = session.accessToken, let userID = session.userID else { return }
        isWorking = true; defer { isWorking = false }
        do {
            try await APIClient.shared.requestGroupMembership(groupID: group.id, accessToken: token, userID: userID)
            message = "Request sent"
        } catch { message = error.localizedDescription }
    }
}

private struct GroupDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let group: UserGroup
    @State private var members: [GroupMember] = []
    @State private var isLoading = true
    @State private var actionMemberID: UUID?
    @State private var error: String?
    @State private var memberToRemove: GroupMember?
    @State private var isConfirmingDelete = false
    private let isRegressionState: Bool

    init(group: UserGroup, regressionMembers: [GroupMember]? = nil) {
        self.group = group
        _members = State(initialValue: regressionMembers ?? [])
        _isLoading = State(initialValue: regressionMembers == nil)
        isRegressionState = regressionMembers != nil
    }

    private var isAdmin: Bool {
        members.contains { $0.userID == session.userID && $0.role == "admin" && $0.status == "approved" }
    }
    private var pendingMembers: [GroupMember] { members.filter { $0.status == "pending" } }
    private var approvedMembers: [GroupMember] { members.filter { $0.status == "approved" } }

    var body: some View {
        ProfilePage(title: group.name) {
            VStack(alignment: .leading, spacing: 18) {
                ProfileSurface {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(group.name).font(.title2.bold())
                        if let description = group.description { Text(description).foregroundStyle(GanamosColor.mutedText) }
                        HStack {
                            if let code = group.groupCode {
                                Label(code, systemImage: "number").font(.system(.subheadline, design: .monospaced))
                            }
                            Spacer()
                            if let inviteCode = group.inviteCode,
                               let url = URL(string: "https://www.ganamos.earth/groups/join/\(inviteCode)") {
                                ShareLink(item: url) { Label("Invite", systemImage: "square.and.arrow.up") }
                            }
                        }
                        .foregroundStyle(GanamosColor.green)
                        if isAdmin {
                            Button("Delete group", role: .destructive) { isConfirmingDelete = true }
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                }

                if isLoading { ProgressView().frame(maxWidth: .infinity).padding(.top, 30) }
                else {
                    if isAdmin && !pendingMembers.isEmpty {
                        Text("Join requests").font(.headline)
                        ForEach(pendingMembers) { member in
                            ProfileSurface {
                                VStack(spacing: 13) {
                                    memberRow(member)
                                    HStack(spacing: 10) {
                                        Button("Reject", role: .destructive) { Task { await review(member, approve: false) } }
                                            .buttonStyle(.bordered).frame(maxWidth: .infinity)
                                        Button("Approve") { Task { await review(member, approve: true) } }
                                            .buttonStyle(.borderedProminent).tint(GanamosColor.green).frame(maxWidth: .infinity)
                                    }.disabled(actionMemberID != nil)
                                    if actionMemberID == member.id { ProgressView().controlSize(.small) }
                                }
                            }
                        }
                    }
                    Text("Members").font(.headline)
                    ForEach(approvedMembers) { member in
                        HStack(spacing: 8) {
                            memberRow(member)
                            if isAdmin && member.userID != session.userID {
                                Menu {
                                    Button(member.role == "admin" ? "Remove admin" : "Make admin") {
                                        Task { await changeRole(member) }
                                    }
                                    Button("Remove member", role: .destructive) { memberToRemove = member }
                                } label: { Image(systemName: "ellipsis.circle").font(.title3).foregroundStyle(GanamosColor.mutedText) }
                                    .accessibilityLabel("Manage \(member.profile?.name ?? member.profile?.username ?? "member")")
                            }
                        }.padding(.vertical, 6)
                    }
                }
            }
        }
        .task { if !isRegressionState { await load() } }
        .alert("Couldn’t update member", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "Please try again.") }
        .confirmationDialog("Remove this member?", isPresented: Binding(get: { memberToRemove != nil }, set: { if !$0 { memberToRemove = nil } }), titleVisibility: .visible) {
            Button("Remove member", role: .destructive) { if let memberToRemove { Task { await remove(memberToRemove) } } }
            Button("Cancel", role: .cancel) { memberToRemove = nil }
        }
        .confirmationDialog("Permanently delete \(group.name)?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete group", role: .destructive) { Task { await deleteGroup() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Members will be removed and group posts will become public. This cannot be undone.") }
    }

    private func memberRow(_ member: GroupMember) -> some View {
        HStack(spacing: 12) {
            AsyncImage(url: member.profile?.avatarURL) { $0.resizable().scaledToFill() } placeholder: {
                Circle().fill(GanamosColor.border).overlay(Image(systemName: "person.fill"))
            }
            .frame(width: 44, height: 44).clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(member.profile?.name ?? member.profile?.username ?? "Member").font(.subheadline.weight(.semibold))
                Text(member.status == "pending" ? "Pending approval" : member.role.capitalized)
                    .font(.caption).foregroundStyle(GanamosColor.mutedText)
            }
            Spacer()
            if member.role == "admin" { Image(systemName: "shield.fill").foregroundStyle(GanamosColor.green) }
        }
    }

    private func load() async {
        defer { isLoading = false }
        guard let token = session.accessToken else { return }
        members = (try? await APIClient.shared.groupMembers(groupID: group.id, accessToken: token)) ?? []
    }

    private func review(_ member: GroupMember, approve: Bool) async {
        guard let token = session.accessToken else { return }
        actionMemberID = member.id
        defer { actionMemberID = nil }
        do {
            let result = try await APIClient.shared.reviewGroupMember(memberID: member.id, approve: approve, accessToken: token)
            if approve {
                if let index = members.firstIndex(where: { $0.id == member.id }) {
                    members[index] = GroupMember(id: member.id, userID: member.userID, role: member.role, status: result.status, profile: member.profile)
                }
            } else {
                members.removeAll { $0.id == member.id }
            }
        } catch { self.error = error.localizedDescription }
    }

    private func changeRole(_ member: GroupMember) async {
        guard let token = session.accessToken else { return }
        if member.userID == group.createdBy { error = "The group creator must remain an admin."; return }
        if member.role == "admin" && approvedMembers.filter({ $0.role == "admin" }).count <= 1 { error = "A group must have at least one admin."; return }
        actionMemberID = member.id; defer { actionMemberID = nil }
        let role = member.role == "admin" ? "member" : "admin"
        do {
            try await APIClient.shared.updateGroupMemberRole(memberID: member.id, role: role, accessToken: token)
            if let index = members.firstIndex(where: { $0.id == member.id }) {
                members[index] = GroupMember(id: member.id, userID: member.userID, role: role, status: member.status, profile: member.profile)
            }
        } catch { self.error = error.localizedDescription }
    }

    private func remove(_ member: GroupMember) async {
        memberToRemove = nil
        guard let token = session.accessToken else { return }
        actionMemberID = member.id; defer { actionMemberID = nil }
        do { try await APIClient.shared.removeGroupMember(memberID: member.id, accessToken: token); members.removeAll { $0.id == member.id } }
        catch { self.error = error.localizedDescription }
    }

    private func deleteGroup() async {
        guard let token = session.accessToken else { return }
        do { try await APIClient.shared.deleteGroup(groupID: group.id, accessToken: token); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

struct FamilyAccountsView: View {
    @Environment(SessionStore.self) private var session
    @State private var accounts: [FamilyAccount]
    @State private var isLoading = true
    @State private var webDestination: WebDestination?
    private let isRegressionState: Bool

    init(regressionOverview: ProfileOverview? = nil, regressionAccounts: [FamilyAccount]? = nil) {
        let initialAccounts = regressionAccounts
            ?? regressionOverview?.familyMembers.map { FamilyAccount(member: $0, kind: .quickContact) }
            ?? []
        _accounts = State(initialValue: initialAccounts)
        _isLoading = State(initialValue: regressionOverview == nil && regressionAccounts == nil)
        isRegressionState = regressionOverview != nil || regressionAccounts != nil
    }

    var body: some View {
        ProfilePage(title: "Family accounts") {
            VStack(spacing: 16) {
                ProfileSurface {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Shared family access", systemImage: "figure.2.and.child.holdinghands")
                            .font(.title3.bold()).foregroundStyle(GanamosColor.green)
                        Text("Create simple accounts for family members, fund rewards, and follow their activity from your profile.")
                            .font(.subheadline).foregroundStyle(GanamosColor.mutedText)
                    }
                }

                Button {
                    webDestination = WebDestination(url: URL(string: "https://ganamos.earth/profile")!)
                } label: {
                    Label("Add family member", systemImage: "person.badge.plus")
                        .font(.headline).frame(maxWidth: .infinity).frame(height: 48)
                }
                .buttonStyle(.borderedProminent).tint(GanamosColor.green)

                if isLoading {
                    ProgressView().padding(.top, 50)
                } else if accounts.isEmpty {
                    EmptyState(icon: "person.2", title: "No family accounts", message: "Add a family member to manage rewards together.")
                } else {
                    ForEach(accounts) { account in
                        NavigationLink {
                            FamilyMemberView(account: account) {
                                accounts.removeAll { $0.id == account.id }
                            }
                        } label: {
                            ProfileSurface {
                                HStack(spacing: 14) {
                                    AsyncImage(url: account.member.avatarURL) { $0.resizable().scaledToFill() } placeholder: {
                                        Circle().fill(GanamosColor.border).overlay(Image(systemName: "person.fill"))
                                    }
                                    .frame(width: 52, height: 52).clipShape(Circle())
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(account.displayName).font(.headline)
                                        Text(account.subtitle)
                                            .font(.caption).foregroundStyle(GanamosColor.mutedText)
                                    }
                                    Spacer()
                                    SatsBadge(amount: account.member.balance)
                                }
                            }.foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("familyAccount-\(account.kind.rawValue)-\(account.id.uuidString.lowercased())")
                    }
                }
            }
        }
        .task { if !isRegressionState { await load() } }
        .sheet(item: $webDestination) { destination in NativeWebSheet(url: destination.url).ignoresSafeArea() }
    }

    private func load() async {
        defer { isLoading = false }
        guard let token = session.accessToken, let userID = session.primaryUserID else { return }
        accounts = (try? await APIClient.shared.familyAccounts(accessToken: token, userID: userID)) ?? accounts
    }
}

struct FamilyMemberView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let account: FamilyAccount
    let onRemoved: () -> Void
    @State private var isSending = false
    @State private var isConfirmingRemoval = false
    @State private var isRemoving = false
    @State private var error: String?

    init(account: FamilyAccount, onRemoved: @escaping () -> Void = {}) {
        self.account = account
        self.onRemoved = onRemoved
    }

    private var member: FamilyMember { account.member }

    var body: some View {
        ProfilePage(title: account.displayName) {
            VStack(spacing: 18) {
                ProfileSurface {
                    VStack(spacing: 13) {
                        AsyncImage(url: member.avatarURL) { $0.resizable().scaledToFill() } placeholder: {
                            Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(GanamosColor.green)
                        }
                        .frame(width: 100, height: 100).clipShape(Circle())
                        Text(account.displayName).font(.title2.bold())
                        if let username = member.username { Text("@\(username)").foregroundStyle(GanamosColor.mutedText) }
                        SatsBadge(amount: member.balance)
                    }.frame(maxWidth: .infinity)
                }
                Button {
                    isSending = true
                } label: {
                    Label("Send sats", systemImage: "paperplane.fill")
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).tint(GanamosColor.green)

                Button(role: .destructive) { isConfirmingRemoval = true } label: {
                    Label(account.removalTitle, systemImage: account.kind == .child ? "person.crop.circle.badge.minus" : "person.badge.minus")
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(isRemoving)
                .accessibilityIdentifier("familyRemove-\(account.kind.rawValue)")

                if let error {
                    Text(error).font(.caption).foregroundStyle(.red).multilineTextAlignment(.center)
                } else {
                    Text(account.removalFootnote)
                        .font(.caption).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                }
            }
        }
        .sheet(isPresented: $isSending) {
            WalletSendView(initialRecipient: member.username ?? member.id.uuidString.lowercased()) {}
        }
        .alert(account.removalConfirmationTitle, isPresented: $isConfirmingRemoval) {
            Button(account.removalTitle, role: .destructive) { Task { await remove() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(account.removalConfirmationMessage)
        }
        .overlay { if isRemoving { ProgressView().controlSize(.large) } }
    }

    private func remove() async {
        guard let token = session.accessToken, let userID = session.primaryUserID else { return }
        isRemoving = true
        error = nil
        defer { isRemoving = false }
        do {
            switch account.kind {
            case .child:
                try await APIClient.shared.deleteChildAccount(id: member.id, accessToken: token)
            case .quickContact:
                try await APIClient.shared.removeFamilyContact(memberID: member.id, accessToken: token, userID: userID)
            }
            onRemoved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private extension FamilyAccount {
    var fallbackName: String { kind == .child ? "Child" : "Family member" }
    var displayName: String {
        if let name = member.name?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        if kind == .quickContact,
           let username = member.username?.trimmingCharacters(in: .whitespacesAndNewlines),
           !username.isEmpty {
            return username
        }
        return fallbackName
    }
    var subtitle: String {
        switch kind {
        case .child: "Child account"
        case .quickContact: member.username.map { "@\($0)" } ?? "Family contact"
        }
    }
    var removalTitle: String { kind == .child ? "Delete child account" : "Remove from family" }
    var removalFootnote: String {
        kind == .child
            ? "Deleting a child account deactivates it. Historical activity and transactions remain available."
            : "Removing a family contact does not delete their Ganamos account."
    }
    var removalConfirmationTitle: String {
        let trimmedName = member.name?.trimmingCharacters(in: .whitespacesAndNewlines)
        let subject = trimmedName.flatMap { $0.isEmpty ? nil : $0 }
            ?? (kind == .child ? "this child account" : "this contact")
        return kind == .child ? "Delete \(subject)?" : "Remove \(subject)?"
    }
    var removalConfirmationMessage: String {
        kind == .child
            ? "This child account will be deactivated and disconnected from your profile. Historical activity and transactions are preserved."
            : "This person will be removed from your family contacts. Their Ganamos account will not be changed."
    }
}

struct PetHubView: View {
    @State private var webDestination: WebDestination?

    var body: some View {
        ProfilePage(title: "Satoshi pet") {
            VStack(spacing: 16) {
                ProfileSurface {
                    VStack(spacing: 16) {
                        Circle()
                            .fill(Color.purple.opacity(0.18))
                            .frame(width: 116, height: 116)
                            .overlay(Image(systemName: "pawprint.fill").font(.system(size: 48)).foregroundStyle(Color.purple))
                        Text("Your Bitcoin companion").font(.title2.bold())
                        Text("Connect a Satoshi pet, earn coins through fixes, and customize it in the pet store.")
                            .font(.subheadline).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity)
                }
                petAction("Open pet", subtitle: "See mood, coins, and progress", icon: "heart.fill", path: "/satoshi-pet", color: .pink)
                petAction("Connect a pet", subtitle: "Pair a new Ganamos device", icon: "link", path: "/connect-pet", color: GanamosColor.green)
                petAction("Pet store", subtitle: "Spend coins on accessories", icon: "bag.fill", path: "/pet-store", color: .orange)
                petAction("Pet settings", subtitle: "Device name and preferences", icon: "gearshape.fill", path: "/pet-settings", color: .blue)
            }
        }
        .sheet(item: $webDestination) { destination in NativeWebSheet(url: destination.url).ignoresSafeArea() }
    }

    private func petAction(_ title: String, subtitle: String, icon: String, path: String, color: Color) -> some View {
        Button { webDestination = WebDestination(url: URL(string: "https://ganamos.earth\(path)")!) } label: {
            ProfileSurface {
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 12).fill(color.opacity(0.14)).frame(width: 48, height: 48)
                        .overlay(Image(systemName: icon).foregroundStyle(color))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title).font(.headline)
                        Text(subtitle).font(.caption).foregroundStyle(GanamosColor.mutedText)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(GanamosColor.mutedText)
                }
            }.foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("petAction:\(path)")
    }
}

struct ActivityView: View {
    @Environment(SessionStore.self) private var session
    @State private var transactions: [WalletTransaction] = []
    @State private var activities: [AccountActivity] = []
    @State private var isLoading = true
    private let isRegressionState: Bool
    private let regressionPostsByID: [UUID: GanamosPost]

    init(
        regressionTransactions: [WalletTransaction]? = nil,
        regressionActivities: [AccountActivity]? = nil,
        regressionPostsByID: [UUID: GanamosPost] = [:]
    ) {
        _transactions = State(initialValue: regressionTransactions ?? [])
        _activities = State(initialValue: regressionActivities ?? [])
        _isLoading = State(initialValue: regressionTransactions == nil && regressionActivities == nil)
        isRegressionState = regressionTransactions != nil || regressionActivities != nil
        self.regressionPostsByID = regressionPostsByID
    }

    private var timeline: [ActivityTimelineItem] {
        (transactions.map(ActivityTimelineItem.transaction) + activities.map(ActivityTimelineItem.activity))
            .sorted { $0.date > $1.date }
    }
    var body: some View {
        ProfilePage(title: "Activity") {
            LazyVStack(spacing: 12) {
                if isLoading { ProgressView().padding(.top, 60) }
                else if timeline.isEmpty { EmptyState(icon: "waveform.path.ecg", title: "No activity yet", message: "Your account activity will appear here.") }
                else {
                    ForEach(timeline) { item in
                        if case let .activity(activity) = item, let postID = activity.relatedID, activity.linksToPost {
                            NavigationLink {
                                ActivityPostLoader(
                                    postID: postID,
                                    regressionPost: regressionPostsByID[postID])
                            } label: {
                                ProfileSurface { ProductActivityRow(activity: activity) }.foregroundStyle(.white)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("activityPost-\(postID.uuidString.lowercased())")
                        } else {
                            ProfileSurface {
                                switch item {
                                case let .transaction(transaction): ActivityItemRow(transaction: transaction)
                                case let .activity(activity): ProductActivityRow(activity: activity)
                                }
                            }
                        }
                    }
                }
            }
        }.task { if !isRegressionState { await load() } }
    }
    private func load() async {
        defer { isLoading = false }
        guard let token = session.accessToken, let id = session.userID else { return }
        async let transactionResult = APIClient.shared.transactions(accessToken: token, userID: id, limit: 50)
        async let activityResult = APIClient.shared.activities(accessToken: token, userID: id, limit: 50)
        transactions = (try? await transactionResult) ?? []
        activities = (try? await activityResult) ?? []
    }
}

private extension AccountActivity {
    var linksToPost: Bool { ["post", "fix", "fix_completed", "fix_received", "reject", "post_deleted", "reward"].contains(type) }
}

private struct ActivityPostLoader: View {
    @Environment(SessionStore.self) private var session
    let postID: UUID
    @State private var post: GanamosPost?
    @State private var error: String?

    init(postID: UUID, regressionPost: GanamosPost? = nil) {
        self.postID = postID
        _post = State(initialValue: regressionPost)
    }

    var body: some View {
        Group {
            if let post { PostDetailView(post: post) }
            else if let error { EmptyState(icon: "exclamationmark.triangle", title: "Issue unavailable", message: error) }
            else { ZStack { GanamosColor.canvas.ignoresSafeArea(); ProgressView() } }
        }
        .task {
            guard post == nil else { return }
            guard let token = session.accessToken else { return }
            do { post = try await APIClient.shared.post(id: postID, accessToken: token) }
            catch { self.error = "This issue may have been removed or is no longer visible." }
        }
    }
}

private enum ActivityTimelineItem: Identifiable {
    case transaction(WalletTransaction)
    case activity(AccountActivity)

    var id: String {
        switch self {
        case let .transaction(item): "transaction-\(item.id)"
        case let .activity(item): "activity-\(item.id)"
        }
    }
    var date: Date {
        switch self {
        case let .transaction(item): item.createdAt
        case let .activity(item): item.timestamp
        }
    }
}

private struct ActivityItemRow: View {
    let transaction: WalletTransaction
    var body: some View {
        HStack(spacing: 13) {
            Circle().fill(color.opacity(0.15)).frame(width: 42, height: 42).overlay(Image(systemName: icon).foregroundStyle(color))
            VStack(alignment: .leading, spacing: 4) { Text(title).font(.subheadline.weight(.semibold)); Text(transaction.memo ?? transaction.status.rawValue.capitalized).font(.caption).foregroundStyle(GanamosColor.mutedText).lineLimit(1) }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) { Text("\(transaction.amount > 0 ? "+" : "")\(transaction.amount.formatted())").font(.subheadline.weight(.semibold)).foregroundStyle(color); Text(transaction.createdAt, style: .relative).font(.caption2).foregroundStyle(GanamosColor.mutedText) }
        }
    }
    private var color: Color { transaction.amount >= 0 ? GanamosColor.green : .orange }
    private var icon: String { transaction.amount >= 0 ? "arrow.down.left" : "arrow.up.right" }
    private var title: String { transaction.type == .deposit ? "Deposited Bitcoin" : transaction.type == .withdrawal ? "Withdrew Bitcoin" : transaction.amount >= 0 ? "Received Bitcoin" : "Sent Bitcoin" }
}

private struct ProductActivityRow: View {
    let activity: AccountActivity
    var body: some View {
        HStack(spacing: 13) {
            Circle().fill(color.opacity(0.15)).frame(width: 42, height: 42)
                .overlay(Image(systemName: icon).foregroundStyle(color))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(GanamosColor.mutedText).lineLimit(2)
            }
            Spacer()
            if let value = activity.metadata?.reward ?? activity.metadata?.amount {
                Text("\(value.formatted()) sats").font(.caption.weight(.semibold)).foregroundStyle(color)
            }
            Text(activity.timestamp, style: .relative).font(.caption2).foregroundStyle(GanamosColor.mutedText)
        }
    }

    private var title: String {
        switch activity.type {
        case "post": "Issue posted"
        case "fix", "fix_completed": "Issue fixed"
        case "fix_received": "Fix submitted"
        case "reject": "Fix needs changes"
        case "post_deleted": "Issue deleted"
        case "donation": "Donation"
        case "reward": "Reward received"
        default: activity.type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
    private var detail: String {
        activity.metadata?.title
            ?? activity.metadata?.fixerName.map { "Fixed by \($0)" }
            ?? activity.metadata?.status?.replacingOccurrences(of: "_", with: " ").capitalized
            ?? "Ganamos activity"
    }
    private var icon: String {
        switch activity.type {
        case "post": "camera.fill"
        case "fix", "fix_completed": "checkmark.circle.fill"
        case "fix_received": "wrench.and.screwdriver.fill"
        case "reject": "arrow.uturn.backward.circle.fill"
        case "donation": "leaf.fill"
        case "reward": "bitcoinsign.circle.fill"
        default: "bell.fill"
        }
    }
    private var color: Color {
        switch activity.type {
        case "reject", "post_deleted": .red
        case "donation": .orange
        default: GanamosColor.green
        }
    }
}

struct UserPostsView: View {
    @Environment(SessionStore.self) private var session
    @State private var posts: [GanamosPost] = []
    @State private var filter = "All"
    @State private var isLoading = true
    private let isRegressionState: Bool

    init(regressionPosts: [GanamosPost]? = nil) {
        _posts = State(initialValue: regressionPosts ?? [])
        _isLoading = State(initialValue: regressionPosts == nil)
        isRegressionState = regressionPosts != nil
    }

    private var visiblePosts: [GanamosPost] { filter == "All" ? posts : posts.filter { filter == "Fixed" ? $0.fixed == true : $0.fixed != true } }
    var body: some View {
        ProfilePage(title: "Your Posts") {
            VStack(spacing: 16) {
                Picker("Posts", selection: $filter) { ForEach(["All", "Posted", "Fixed"], id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented)
                if isLoading { ProgressView().padding(.top, 60) }
                else if visiblePosts.isEmpty { EmptyState(icon: "camera", title: "No posts yet", message: "Posts you create and fix will appear here.") }
                else { ForEach(visiblePosts) { post in NavigationLink(value: post) { ProfileSurface { HStack(spacing: 14) { AsyncImage(url: post.imageURL) { $0.resizable().scaledToFill() } placeholder: { GanamosColor.green.opacity(0.12).overlay(Image(systemName: "camera").foregroundStyle(GanamosColor.green)) }.frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 12)); VStack(alignment: .leading, spacing: 5) { Text(post.title ?? post.description).font(.headline).lineLimit(2); Text(post.fixed == true ? "Fixed" : "Posted").font(.caption).foregroundStyle(post.fixed == true ? GanamosColor.green : GanamosColor.mutedText) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(GanamosColor.mutedText) } }.foregroundStyle(.white) } } }
            }
        }.navigationDestination(for: GanamosPost.self) { PostDetailView(post: $0) }.task { if !isRegressionState { await load() } }
    }
    private func load() async { defer { isLoading = false }; guard let token = session.accessToken, let id = session.userID else { return }; posts = (try? await APIClient.shared.userPosts(accessToken: token, userID: id)) ?? [] }
}

struct AdminView: View {
    @Environment(SessionStore.self) private var session
    @State private var webDestination: WebDestination?
    @State private var stats: AdminStats?
    @State private var failed = false
    private let usesRegressionStats: Bool
    private let cards = [("Pet Orders", "shippingbox", Color.orange), ("Users", "person.2.fill", Color.blue), ("Posts", "doc.text.fill", Color.purple), ("Transactions", "creditcard.fill", GanamosColor.green)]

    init(regressionStats: AdminStats? = nil) {
        _stats = State(initialValue: regressionStats)
        usesRegressionStats = regressionStats != nil
    }

    var body: some View {
        ProfilePage(title: "Admin") {
            VStack(alignment: .leading, spacing: 18) {
                Text("Dashboard").font(.largeTitle.bold())
                if failed { ProfileSurface { Label("This account doesn’t have access to admin data.", systemImage: "lock.fill").foregroundStyle(GanamosColor.mutedText) } }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(Array(cards.enumerated()), id: \.offset) { index, card in ProfileSurface { VStack(alignment: .leading, spacing: 12) { Image(systemName: card.1).foregroundStyle(card.2).padding(8).background(card.2.opacity(0.12), in: RoundedRectangle(cornerRadius: 9)); Text(card.0).font(.caption).foregroundStyle(GanamosColor.mutedText); Text(value(index).formatted()).font(.title.bold()) } } }
                }
                Button { webDestination = WebDestination(url: URL(string: "https://ganamos.earth/admin")!) } label: { Label("Open full admin tools", systemImage: "arrow.up.right.square").frame(maxWidth: .infinity).frame(height: 44) }.buttonStyle(.bordered)
            }
        }
        .task { if !usesRegressionStats { await load() } }
        .sheet(item: $webDestination) { destination in NativeWebSheet(url: destination.url).ignoresSafeArea() }
    }
    private func value(_ index: Int) -> Int { guard let stats else { return 0 }; return [stats.orders, stats.users, stats.posts, stats.transactions][index] }
    private func load() async { guard let token = session.accessToken else { return }; do { stats = try await APIClient.shared.adminStats(accessToken: token) } catch { failed = true } }
}
