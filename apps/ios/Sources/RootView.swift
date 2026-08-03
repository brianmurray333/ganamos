import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        @Bindable var session = session
        TabView {
            NavigationStack { FeedView() }
                .tabItem { Label("Fixes", systemImage: "house.fill") }
            NavigationStack { MapScreen() }
                .tabItem { Label("Map", systemImage: "map.fill") }
            NavigationStack { NewFixView() }
                .tabItem { Label("New", systemImage: "plus.circle.fill") }
            NavigationStack { WalletView() }
                .tabItem { Label("Wallet", systemImage: "bitcoinsign.circle.fill") }
            NavigationStack { ProfileView() }
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
        }
        .sheet(isPresented: $session.isPresentingLogin) { LoginView() }
        .task { await session.restore() }
    }
}
