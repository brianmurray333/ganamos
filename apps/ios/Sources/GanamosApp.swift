import SwiftUI

@main
struct GanamosApp: App {
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .tint(GanamosColor.green)
        }
    }
}
