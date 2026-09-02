import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL
    @State private var selection: AppTab = .home
    @State private var accessPrompt: AppTab?

    var body: some View {
        @Bindable var session = session
        TabView(selection: tabSelection) {
            NavigationStack { FeedView() }
                .tag(AppTab.home)
                .tabItem { Label("Home", image: "LucideHome") }
            NavigationStack { MapScreen() }
                .tag(AppTab.map)
                .tabItem { Label("Map", image: "LucideMap") }
            NavigationStack { NewFixView() }
                .tag(AppTab.new)
                .tabItem { Label("New", systemImage: "plus") }
            NavigationStack { WalletView() }
                .tag(AppTab.wallet)
                .tabItem { Label("Wallet", image: "LucideWallet") }
            NavigationStack { ProfileView() }
                .tag(AppTab.profile)
                .tabItem { Label("Profile", image: "LucideUser") }
        }
        .tint(GanamosColor.green)
        .overlay(alignment: .bottom) {
            if !session.isAuthenticated {
                SignedOutTabInterceptors { requestedTab in
                    accessPrompt = requestedTab
                }
            }
        }
        .sheet(isPresented: $session.isPresentingLogin) {
            LoginView(initialPresentation: session.authPresentation)
        }
        .sheet(item: $accessPrompt) { tab in
            AccessPromptSheet(
                destination: tab.title,
                message: tab.accessMessage,
                signUp: {
                    accessPrompt = nil
                    Task { @MainActor in
                        await Task.yield()
                        session.authPresentation = .signUp
                        session.isPresentingLogin = true
                    }
                },
                logIn: {
                    accessPrompt = nil
                    Task { @MainActor in
                        await Task.yield()
                        session.authPresentation = .login
                        session.isPresentingLogin = true
                    }
                })
                .presentationDetents([.height(330)])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(24)
                .presentationBackground(GanamosColor.surface)
        }
        .task { await session.restore() }
    }

    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { selection },
            set: { requestedTab in
                if !session.isAuthenticated, requestedTab.requiresAuthentication {
                    accessPrompt = requestedTab
                } else {
                    selection = requestedTab
                }
            }
        )
    }
}

private struct SignedOutTabInterceptors: View {
    let requestAccess: (AppTab) -> Void

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                Color.clear
                    .frame(width: proxy.size.width * 0.6)
                    .allowsHitTesting(false)

                accessButton(for: .wallet)
                    .frame(width: proxy.size.width * 0.2)

                accessButton(for: .profile)
                    .frame(width: proxy.size.width * 0.2)
            }
        }
        // Covers the visible tab bar and the device safe area without blocking page content.
        .frame(height: 84)
    }

    private func accessButton(for tab: AppTab) -> some View {
        Button {
            requestAccess(tab)
        } label: {
            Color.clear
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.title)
        .accessibilityHint("Shows sign up and log in options")
    }
}

private enum AppTab: Hashable, Identifiable {
    case home, map, new, wallet, profile

    var id: Self { self }
    var requiresAuthentication: Bool { self == .wallet || self == .profile }
    var title: String { self == .wallet ? "Wallet" : "Profile" }
    var accessMessage: String {
        self == .wallet
            ? "Create an account to access your Bitcoin wallet and manage your earnings."
            : "Create an account to access your profile and track your activity."
    }
}

private struct AccessPromptSheet: View {
    @Environment(\.dismiss) private var dismiss
    let destination: String
    let message: String
    let signUp: () -> Void
    let logIn: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(GanamosColor.mutedText)
                        .frame(width: 32, height: 32)
                        .background(GanamosColor.canvas.opacity(0.65), in: Circle())
                }
                .accessibilityLabel("Close")
            }

            Text("Sign up to access your \(destination.lowercased())")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.top, 2)

            Text(message)
                .font(.body)
                .foregroundStyle(GanamosColor.mutedText)
                .multilineTextAlignment(.center)
                .padding(.top, 14)

            VStack(spacing: 12) {
                Button(action: signUp) {
                    Text("Sign up")
                        .font(.headline)
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                Button(action: logIn) {
                    Text("Log in")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(GanamosColor.canvas.opacity(0.45), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(GanamosColor.border)
                        }
                }
            }
            .padding(.top, 24)
        }
        .padding(.horizontal, 22)
        .padding(.top, 4)
        .preferredColorScheme(.dark)
    }
}
