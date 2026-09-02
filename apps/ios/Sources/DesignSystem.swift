import SafariServices
import SwiftUI

enum GanamosColor {
    static let green = Color(red: 0.13, green: 0.77, blue: 0.37)
    static let amber = Color(red: 0.996, green: 0.835, blue: 0.42)
    static let canvas = Color(red: 0.025, green: 0.047, blue: 0.09)
    static let surface = Color(red: 0.055, green: 0.08, blue: 0.14)
    static let mutedText = Color(red: 0.58, green: 0.64, blue: 0.72)
    static let border = Color(red: 0.16, green: 0.21, blue: 0.29)
}

struct WebDestination: Identifiable {
    let id = UUID()
    let url: URL
}

struct NativeWebSheet: UIViewControllerRepresentable {
    let url: URL
    var onFinish: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(onFinish: onFinish)
    }

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(GanamosColor.green)
        controller.dismissButtonStyle = .close
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}

    final class Coordinator: NSObject, @preconcurrency SFSafariViewControllerDelegate {
        private let onFinish: (() -> Void)?

        init(onFinish: (() -> Void)?) {
            self.onFinish = onFinish
        }

        @MainActor
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            // When Safari is hosted by a SwiftUI sheet, its Close control does
            // not reliably tear down the presenting host on every iOS version.
            // Complete UIKit dismissal before clearing the SwiftUI item.
            controller.dismiss(animated: true) { [onFinish] in
                onFinish?()
            }
        }
    }
}

struct SatsBadge: View {
    let amount: Int

    private var formattedAmount: String {
        if amount >= 1_000_000 {
            let millions = Double(amount) / 1_000_000
            return millions.rounded(.down) == millions
                ? "\(Int(millions))M sats"
                : String(format: "%.1fM sats", millions)
        }
        if amount >= 100_000 { return "\(amount / 1_000)k sats" }
        if amount >= 1_000 {
            let thousands = Double(amount) / 1_000
            return thousands.rounded(.down) == thousands
                ? "\(Int(thousands))k sats"
                : String(format: "%.1fk sats", thousands)
        }
        return "\(amount) sats"
    }

    var body: some View {
        HStack(spacing: 6) {
            Image("BitcoinLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 14, height: 14)
                .accessibilityHidden(true)
            Text(formattedAmount)
        }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color(red: 1.0, green: 0.83, blue: 0.62))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(red: 0.32, green: 0.13, blue: 0.02), in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Balance: \(formattedAmount)")
            .accessibilityIdentifier("home-balance-badge")
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

struct AuthenticationRequiredView: View {
    let pageTitle: String
    let accessTitle: String
    let message: String
    let signIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text(pageTitle)
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(.white)

            VStack(spacing: 10) {
                Text(accessTitle)
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(.white)

                Text(message)
                    .font(.body)
                    .foregroundStyle(GanamosColor.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 12)

                Button("Sign in", action: signIn)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.vertical, 36)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(GanamosColor.border)
            }

            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.top, 18)
    }
}
