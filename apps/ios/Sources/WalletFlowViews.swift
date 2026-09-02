import SwiftUI

struct WalletReceiveView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var amount = ""
    @State private var secureWebDestination: WebDestination?
    @FocusState private var amountIsFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                GanamosColor.canvas.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 22) {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 58)).foregroundStyle(GanamosColor.green)
                        VStack(spacing: 7) {
                            Text("Receive bitcoin").font(.title.bold())
                            Text("Create a Lightning invoice to add sats to your Ganamos balance.")
                                .font(.subheadline).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                        }
                        VStack(alignment: .leading, spacing: 9) {
                            Text("AMOUNT").font(.caption.weight(.semibold)).foregroundStyle(GanamosColor.mutedText)
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                TextField("0", text: $amount).keyboardType(.numberPad)
                                    .font(.system(size: 36, weight: .bold, design: .rounded))
                                    .focused($amountIsFocused)
                                    .accessibilityIdentifier("walletReceiveAmount")
                                Text("sats").font(.title3.weight(.semibold)).foregroundStyle(GanamosColor.mutedText)
                            }
                            .padding(18).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).stroke(GanamosColor.border))
                            Text("Minimum 100 sats").font(.caption).foregroundStyle(GanamosColor.mutedText)
                        }
                        Button("Create invoice") {
                            let value = max(Int(amount) ?? 100, 100)
                            secureWebDestination = WebDestination(url: URL(string: "https://ganamos.earth/wallet/deposit?amount=\(value)")!)
                        }
                        .buttonStyle(WalletPrimaryButtonStyle(color: GanamosColor.green))
                        .disabled((Int(amount) ?? 0) < 100)
                        .accessibilityIdentifier("walletCreateInvoice")
                        Text("The final invoice is created in Ganamos’s secure payment screen. Your balance updates only after the Lightning payment settles.")
                            .font(.footnote).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                    }.padding(24)
                }
            }
            .foregroundStyle(.white).navigationTitle("Receive").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { amountIsFocused = false }
                        .accessibilityLabel("Dismiss keyboard")
                }
            }
            .sheet(item: $secureWebDestination) { NativeWebSheet(url: $0.url).ignoresSafeArea() }
        }.preferredColorScheme(.dark)
    }
}

struct WalletSendView: View {
    enum Destination: String, CaseIterable { case member = "Ganamos member"; case lightning = "Lightning invoice" }
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var destination: Destination = .member
    @State private var recipient = ""
    @State private var amount = ""
    @State private var memo = ""
    @State private var isConfirming = false
    @State private var isSending = false
    @State private var error: String?
    @FocusState private var focusedField: Field?
    let completed: () -> Void

    private enum Field: Hashable { case recipient, amount, memo }

    init(initialRecipient: String = "", completed: @escaping () -> Void) {
        _recipient = State(initialValue: initialRecipient)
        self.completed = completed
    }

    var body: some View {
        NavigationStack {
            ZStack {
                GanamosColor.canvas.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 18) {
                        Picker("Destination", selection: $destination) {
                            ForEach(Destination.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.segmented)
                        walletField(destination == .member ? "USERNAME" : "BOLT11 INVOICE", text: $recipient, axis: destination == .member ? .horizontal : .vertical)
                        walletField("AMOUNT (SATS)", text: $amount, keyboard: .numberPad)
                        if destination == .member { walletField("MEMO (OPTIONAL)", text: $memo) }
                        HStack {
                            Text("Available balance")
                            Spacer()
                            Text("\((session.profile?.balance ?? 0).formatted()) sats").fontWeight(.semibold)
                        }.font(.subheadline).foregroundStyle(GanamosColor.mutedText)
                        if let error { Text(error).font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
                        Button("Review payment") { isConfirming = true }
                            .buttonStyle(WalletPrimaryButtonStyle(color: .red)).disabled(!isValid)
                            .accessibilityIdentifier("walletReviewPayment")
                    }.padding(20)
                }
            }
            .foregroundStyle(.white).navigationTitle("Send").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityLabel("Dismiss keyboard")
                }
            }
            .confirmationDialog("Send \(Int(amount)?.formatted() ?? "0") sats?", isPresented: $isConfirming, titleVisibility: .visible) {
                Button("Send payment", role: .destructive) { Task { await send() } }
                Button("Cancel", role: .cancel) {}
            } message: { Text(destination == .member ? "To @\(recipient)" : "Lightning payments cannot be reversed.") }
            .overlay { if isSending { ProgressView().controlSize(.large) } }
        }.preferredColorScheme(.dark)
    }

    private var isValid: Bool {
        guard let sats = Int(amount), sats > 0, sats <= (session.profile?.balance ?? 0) else { return false }
        return !recipient.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @ViewBuilder private func walletField(_ label: String, text: Binding<String>, keyboard: UIKeyboardType = .default, axis: Axis = .horizontal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(GanamosColor.mutedText)
            TextField("", text: text, axis: axis).keyboardType(keyboard).textInputAutocapitalization(.never)
                .padding(15).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
                .focused($focusedField, equals: field(for: label))
                .accessibilityIdentifier(identifier(for: label))
        }
    }

    private func field(for label: String) -> Field {
        if label == "AMOUNT (SATS)" { return .amount }
        if label == "MEMO (OPTIONAL)" { return .memo }
        return .recipient
    }

    private func identifier(for label: String) -> String {
        if label == "AMOUNT (SATS)" { return "walletSendAmount" }
        if label == "MEMO (OPTIONAL)" { return "walletSendMemo" }
        return "walletSendRecipient"
    }

    private func send() async {
        guard let token = session.accessToken, let sats = Int(amount) else { return }
        isSending = true; error = nil
        defer { isSending = false }
        do {
            let result = destination == .member
                ? try await APIClient.shared.transferSats(to: recipient.trimmingCharacters(in: .whitespaces), amount: sats, memo: memo.isEmpty ? nil : memo, accessToken: token)
                : try await APIClient.shared.payLightningInvoice(recipient.trimmingCharacters(in: .whitespacesAndNewlines), amount: sats, accessToken: token)
            guard result.success else { throw APIError.server(result.error ?? "Payment failed.") }
            try? await session.refreshProfile(); completed(); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

private struct WalletPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    let color: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 54)
            .background(
                color.opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.32),
                in: RoundedRectangle(cornerRadius: 14))
    }
}
