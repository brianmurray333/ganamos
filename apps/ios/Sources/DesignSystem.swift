import SwiftUI

enum GanamosColor {
    static let green = Color(red: 0.09, green: 0.55, blue: 0.27)
    static let amber = Color(red: 0.96, green: 0.63, blue: 0.12)
    static let canvas = Color(uiColor: .systemGroupedBackground)
}

struct SatsBadge: View {
    let amount: Int

    var body: some View {
        Label("\(amount.formatted()) sats", systemImage: "bitcoinsign.circle.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.orange)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.orange.opacity(0.12), in: Capsule())
            .accessibilityLabel("Balance: \(amount) sats")
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView(title, systemImage: icon, description: Text(message))
    }
}
