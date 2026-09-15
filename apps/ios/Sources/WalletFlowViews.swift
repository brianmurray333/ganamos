import CoreImage.CIFilterBuiltins
import SwiftUI

private enum DepositMonitoringState {
    case waiting, delayed, expired, settled
}

struct PendingDepositRequest: Codable {
    let requestID: UUID
    let ownerID: UUID
    let amount: Int
    let createdAt: Date
}

struct StoredDepositInvoice: Codable {
    let ownerID: UUID
    let invoice: DepositInvoice
}

enum DepositRecoveryStore {
    private static func pendingKey(_ ownerID: UUID) -> String { "pendingDeposit.\(ownerID.uuidString)" }
    private static func invoiceKey(_ ownerID: UUID) -> String { "activeDeposit.\(ownerID.uuidString)" }

    static func pending(ownerID: UUID) -> PendingDepositRequest? {
        decode(PendingDepositRequest.self, account: pendingKey(ownerID))
    }

    static func save(_ request: PendingDepositRequest) throws {
        try encode(request, account: pendingKey(request.ownerID))
    }

    static func clearPending(ownerID: UUID) { KeychainStore.delete(account: pendingKey(ownerID)) }

    static func invoice(ownerID: UUID) -> StoredDepositInvoice? {
        decode(StoredDepositInvoice.self, account: invoiceKey(ownerID))
    }

    static func save(_ invoice: StoredDepositInvoice) throws {
        try encode(invoice, account: invoiceKey(invoice.ownerID))
    }

    static func clearInvoice(ownerID: UUID) { KeychainStore.delete(account: invoiceKey(ownerID)) }

    private static func encode<T: Encodable>(_ value: T, account: String) throws {
        let data = try JSONEncoder().encode(value)
        guard let string = String(data: data, encoding: .utf8) else { throw APIError.server("Could not encode deposit recovery data.") }
        try KeychainStore.save(string, account: account)
    }

    private static func decode<T: Decodable>(_ type: T.Type, account: String) -> T? {
        guard let string = KeychainStore.read(account: account), let data = string.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

struct WalletReceiveView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var amount = ""
    @State private var invoice: DepositInvoice?
    @State private var isCreating = false
    @State private var error: String?
    @State private var monitoringState: DepositMonitoringState = .waiting
    @State private var invoiceOwnerID: UUID?
    @State private var creationTask: Task<Void, Never>?
    @State private var creationID = UUID()
    @State private var pollingRetry = 0
    @FocusState private var amountIsFocused: Bool
    private let monitoringEnabled: Bool

    init(
        initialInvoice: DepositInvoice? = nil,
        initialOwnerID: UUID? = nil,
        monitoringEnabled: Bool = true
    ) {
        _invoice = State(initialValue: initialInvoice)
        _invoiceOwnerID = State(initialValue: initialOwnerID)
        self.monitoringEnabled = monitoringEnabled
    }

    var body: some View {
        NavigationStack {
            ZStack {
                GanamosColor.canvas.ignoresSafeArea()
                ScrollView {
                    if let invoice {
                        invoiceContent(invoice)
                    } else {
                        amountContent
                    }
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
        }
        .preferredColorScheme(.dark)
        .task(id: "\(invoice?.invoiceID ?? ""):\(invoiceOwnerID?.uuidString ?? ""):\(session.userID?.uuidString ?? "signed-out"):\(pollingRetry)") {
            guard monitoringEnabled, let invoice, let ownerID = invoiceOwnerID else { return }
            await pollForSettlement(invoice: invoice, ownerID: ownerID)
        }
        .task(id: session.userID) {
            guard monitoringEnabled else { return }
            await recoverDepositIfNeeded()
        }
        .onDisappear { creationTask?.cancel() }
    }

    private var amountContent: some View {
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
            if let error {
                Text(error).font(.subheadline).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("walletReceiveError")
            }
            Button {
                creationTask?.cancel()
                creationTask = Task { await createInvoice() }
            } label: {
                if isCreating {
                    ProgressView().tint(.white)
                } else {
                    Text("Create invoice")
                }
            }
            .buttonStyle(WalletPrimaryButtonStyle(color: GanamosColor.green))
            .disabled(!((100...10_000_000).contains(Int(amount) ?? 0)) || isCreating)
            .accessibilityIdentifier("walletCreateInvoice")
            Text("Your balance updates only after the Lightning payment settles.")
                .font(.footnote).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
        }.padding(24)
    }

    private func invoiceContent(_ invoice: DepositInvoice) -> some View {
        VStack(spacing: 20) {
            VStack(spacing: 6) {
                Text(monitoringState == .settled ? "Payment received" : "Invoice ready").font(.title.bold())
                Text("\(invoice.amount.formatted()) sats")
                    .font(.title3.weight(.semibold)).foregroundStyle(GanamosColor.green)
            }
            HStack(spacing: 8) {
                Image(systemName: monitoringState == .settled ? "checkmark.circle.fill" : monitoringState == .expired ? "exclamationmark.circle" : "clock")
                Text(monitoringLabel)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(monitoringState == .settled ? GanamosColor.green : GanamosColor.mutedText)
            .accessibilityIdentifier("walletInvoiceStatus")
            if monitoringState == .delayed {
                Button("Check payment now") { pollingRetry += 1 }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("walletRetryInvoiceStatus")
            }
            if let qrCode = lightningQRCode(for: invoice.paymentRequest) {
                Image(uiImage: qrCode)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 280)
                    .padding(16)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityLabel("Lightning invoice QR code")
                    .accessibilityIdentifier("walletInvoiceQRCode")
            } else {
                Text("The QR code could not be generated. Copy or share the invoice instead.")
                    .font(.subheadline).foregroundStyle(.red).multilineTextAlignment(.center)
                    .accessibilityIdentifier("walletInvoiceQRError")
            }
            Text(invoice.paymentRequest)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(GanamosColor.mutedText)
                .lineLimit(3)
                .truncationMode(.middle)
                .textSelection(.enabled)
            HStack(spacing: 12) {
                Button {
                    UIPasteboard.general.string = invoice.paymentRequest
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(.borderedProminent).tint(GanamosColor.green)
                .accessibilityIdentifier("walletCopyInvoice")

                ShareLink(item: invoice.paymentRequest) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity).frame(height: 50)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("walletShareInvoice")
            }
            if monitoringState == .settled || monitoringState == .expired {
                Button("Create another invoice") {
                    self.invoice = nil
                    invoiceOwnerID = nil
                    amount = ""
                    error = nil
                    monitoringState = .waiting
                }
                .font(.subheadline.weight(.semibold))
            }
        }.padding(24)
    }

    private var monitoringLabel: String {
        switch monitoringState {
        case .waiting: "Waiting for payment"
        case .delayed: "Payment status is delayed"
        case .expired: "Invoice expired"
        case .settled: "Balance updated"
        }
    }

    private func createInvoice(requestID recoveredRequestID: UUID? = nil, recoveredAmount: Int? = nil) async {
        guard let sats = recoveredAmount ?? Int(amount), (100...10_000_000).contains(sats),
              let token = session.accessToken,
              let userID = session.userID else { return }
        let pending = PendingDepositRequest(
            requestID: recoveredRequestID ?? UUID(),
            ownerID: userID,
            amount: sats,
            createdAt: Date())
        let operationID = UUID()
        creationID = operationID
        amountIsFocused = false
        isCreating = true
        error = nil
        defer {
            if creationID == operationID { isCreating = false }
        }
        do {
            try DepositRecoveryStore.save(pending)
            let created = try await APIClient.shared.createDepositInvoice(
                amount: sats,
                userID: userID,
                requestID: pending.requestID,
                accessToken: token)
            try DepositRecoveryStore.save(StoredDepositInvoice(ownerID: userID, invoice: created))
            DepositRecoveryStore.clearPending(ownerID: userID)
            guard creationID == operationID,
                  session.userID == userID,
                  session.accessToken != nil else { return }
            monitoringState = .waiting
            invoiceOwnerID = userID
            invoice = created
        } catch is CancellationError {
            return
        } catch {
            guard creationID == operationID,
                  session.userID == userID else { return }
            self.error = error.localizedDescription
        }
    }

    private func recoverDepositIfNeeded() async {
        guard invoice == nil, let ownerID = session.userID else { return }
        if let stored = DepositRecoveryStore.invoice(ownerID: ownerID) {
            amount = String(stored.invoice.amount)
            invoiceOwnerID = ownerID
            invoice = stored.invoice
            monitoringState = .waiting
            return
        }
        guard let pending = DepositRecoveryStore.pending(ownerID: ownerID) else { return }
        guard Date().timeIntervalSince(pending.createdAt) < 2 * 60 * 60 else {
            DepositRecoveryStore.clearPending(ownerID: ownerID)
            return
        }
        amount = String(pending.amount)
        await createInvoice(requestID: pending.requestID, recoveredAmount: pending.amount)
    }

    private func pollForSettlement(invoice expectedInvoice: DepositInvoice, ownerID: UUID) async {
        guard let expiresAt = depositInvoiceExpirationDate(expectedInvoice.expiresAt) else {
            monitoringState = .delayed
            return
        }
        var consecutiveFailures = 0

        while true {
            guard !Task.isCancelled,
                  invoice?.invoiceID == expectedInvoice.invoiceID,
                  invoiceOwnerID == ownerID else { return }
            guard session.userID == ownerID else {
                invoice = nil
                invoiceOwnerID = nil
                error = "The selected account changed. Create a new invoice for the active account."
                return
            }
            guard let currentToken = session.accessToken else {
                consecutiveFailures += 1
                monitoringState = .delayed
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                continue
            }

            if Date() >= expiresAt { monitoringState = .delayed }

            do {
                let status = try await APIClient.shared.depositStatus(
                    invoiceID: expectedInvoice.invoiceID,
                    accessToken: currentToken)
                try Task.checkCancellation()
                guard session.userID == ownerID else {
                    invoice = nil
                    invoiceOwnerID = nil
                    error = "The selected account changed. Create a new invoice for the active account."
                    return
                }
                guard invoice?.invoiceID == expectedInvoice.invoiceID else { return }
                if status.settled {
                    monitoringState = .settled
                    DepositRecoveryStore.clearInvoice(ownerID: ownerID)
                    try? await session.refreshProfile()
                    return
                }
                if status.status == "expired" {
                    monitoringState = .expired
                    DepositRecoveryStore.clearInvoice(ownerID: ownerID)
                    return
                }
                consecutiveFailures = 0
                monitoringState = .waiting
            } catch is CancellationError {
                return
            } catch {
                consecutiveFailures += 1
                if consecutiveFailures >= 3 { monitoringState = .delayed }
            }

            do {
                let delay = Date() >= expiresAt ? 30 : (consecutiveFailures >= 3 ? 5 : 2)
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
        }
    }
}

func lightningQRCode(for value: String) -> UIImage? {
    guard !value.isEmpty else { return nil }
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(value.uppercased().utf8)
    filter.correctionLevel = "M"
    guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)) else { return nil }
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cgImage = context.createCGImage(output, from: output.extent) else { return nil }
    return UIImage(cgImage: cgImage)
}

func depositInvoiceExpirationDate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
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
