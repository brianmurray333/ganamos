import SwiftUI

enum GanamosColor {
    static let green = Color(red: 0.13, green: 0.77, blue: 0.37)
    static let amber = Color(red: 0.996, green: 0.835, blue: 0.42)
    static let canvas = Color(red: 0.025, green: 0.047, blue: 0.09)
    static let surface = Color(red: 0.055, green: 0.08, blue: 0.14)
    static let mutedText = Color(red: 0.58, green: 0.64, blue: 0.72)
    static let border = Color(red: 0.16, green: 0.21, blue: 0.29)
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

struct RewardBadge: View {
    let amount: Int

    private var formattedAmount: String {
        guard amount >= 1_000 else { return String(amount) }
        let thousands = Double(amount) / 1_000
        if thousands.rounded(.down) == thousands { return "\(Int(thousands))k" }
        return String(format: "%.1fk", thousands)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Circle()
                .fill(GanamosColor.amber)
                .overlay(Circle().stroke(Color(red: 0.77, green: 0.47, blue: 0.18), lineWidth: 1))
                .overlay {
                    Image("BitcoinLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 43, height: 43)
                }
                .shadow(color: Color(red: 0.96, green: 0.76, blue: 0.31), radius: 0, x: 0, y: 0)
                .frame(width: 48, height: 48)
                .padding(.bottom, 10)

            Text(formattedAmount)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(.black)
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .background(.white, in: Capsule())
                .overlay(Capsule().stroke(Color(red: 0.97, green: 0.58, blue: 0.10), lineWidth: 1))
                .shadow(color: .black.opacity(0.18), radius: 2, y: 2)
        }
        .frame(width: 62, height: 62)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Reward: \(amount) sats")
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
