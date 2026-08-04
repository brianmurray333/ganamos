import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @State private var selection: AppTab = .home

    var body: some View {
        @Bindable var session = session
        TabView(selection: $selection) {
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
        .sheet(isPresented: $session.isPresentingLogin) { LoginView() }
        .task { await session.restore() }
    }
}

private enum AppTab: Hashable {
    case home, map, new, wallet, profile
}
