import CoreImage.CIFilterBuiltins
import SwiftUI

struct DonateView: View {
    private enum Field: Hashable {
        case customAmount
        case location
        case donorName
        case message
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var step = 1
    @State private var amount = 10_000
    @State private var customAmount = ""
    @State private var location = "Global"
    @State private var donorName = ""
    @State private var message = ""
    @State private var invoice: DonationInvoice?
    @State private var isWorking = false
    @State private var isPaid = false
    @State private var error: String?
    @FocusState private var focusedField: Field?

    private let presets = [1_000, 5_000, 10_000, 25_000]

    var body: some View {
        ZStack {
            GanamosColor.canvas.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    stepHeader
                    switch step {
                    case 1: amountStep
                    case 2: locationStep
                    default: paymentStep
                    }
                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline).foregroundStyle(.red)
                    }
                }.padding(20)
            }
        }
        .navigationTitle("Donate")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button { focusedField = nil } label: { Image(systemName: "keyboard.chevron.compact.down") }
                    .accessibilityLabel("Dismiss keyboard")
            }
        }
        .preferredColorScheme(.dark)
        .task(id: invoice?.paymentHash) { await pollPayment() }
    }

    private var stepHeader: some View {
        VStack(spacing: 12) {
            Image(systemName: "leaf.fill").font(.system(size: 34)).foregroundStyle(GanamosColor.green)
            Text(["Donation Amount", "Pick Location", "Pay Invoice"][step - 1])
                .font(.title2.bold())
            HStack(spacing: 8) {
                ForEach(1...3, id: \.self) { value in
                    Capsule().fill(value <= step ? GanamosColor.green : GanamosColor.border)
                        .frame(width: value == step ? 34 : 12, height: 7)
                }
            }
        }.frame(maxWidth: .infinity)
    }

    private var amountStep: some View {
        VStack(spacing: 18) {
            ProfileDonationSurface {
                VStack(spacing: 8) {
                    Image(systemName: "bitcoinsign.circle.fill").font(.system(size: 44)).foregroundStyle(.orange)
                    Text("\(amount.formatted()) sats").font(.system(size: 34, weight: .bold, design: .rounded))
                    Text("Boost rewards for fixes in a community you care about.")
                        .font(.subheadline).foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                }.frame(maxWidth: .infinity)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(presets, id: \.self) { value in
                    Button("\(value.formatted()) sats") { amount = value; customAmount = "" }
                        .buttonStyle(.bordered)
                        .tint(amount == value ? GanamosColor.green : .white)
                }
            }
            TextField("Custom amount", text: $customAmount)
                .keyboardType(.numberPad)
                .focused($focusedField, equals: .customAmount)
                .accessibilityIdentifier("donationCustomAmount")
                .padding(14).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
                .onChange(of: customAmount) { _, value in
                    customAmount = String(value.filter(\.isNumber).prefix(8))
                    if let parsed = Int(customAmount) { amount = parsed }
                }
            primaryButton("Choose location") { focusedField = nil; step = 2 }
                .accessibilityIdentifier("donationChooseLocation")
                .disabled(amount < 100)
        }
    }

    private var locationStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Where should your donation help?").font(.headline)
            ForEach([("Global", "globe.americas.fill"), ("United States", "flag.fill")], id: \.0) { option in
                Button { location = option.0 } label: {
                    HStack(spacing: 14) {
                        Image(systemName: option.1).foregroundStyle(GanamosColor.green).frame(width: 28)
                        Text(option.0).font(.headline)
                        Spacer()
                        Image(systemName: location == option.0 ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(location == option.0 ? GanamosColor.green : GanamosColor.mutedText)
                    }.padding(17).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border))
                }.buttonStyle(.plain)
            }
            TextField("Or enter a city, state, or country", text: $location)
                .textContentType(.addressCity).padding(14)
                .focused($focusedField, equals: .location)
                .accessibilityIdentifier("donationLocation")
                .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
            TextField("Your name (optional)", text: $donorName)
                .focused($focusedField, equals: .donorName)
                .accessibilityIdentifier("donationDonorName")
                .padding(14).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
            TextField("Message (optional)", text: $message, axis: .vertical).lineLimit(2...4)
                .focused($focusedField, equals: .message)
                .accessibilityIdentifier("donationMessage")
                .padding(14).background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(GanamosColor.border))
            HStack(spacing: 12) {
                Button("Back") { step = 1 }.buttonStyle(.bordered).frame(maxWidth: .infinity)
                primaryButton(isWorking ? "Creating…" : "Create invoice") { Task { await createInvoice() } }
                    .accessibilityIdentifier("donationCreateInvoice")
                    .disabled(isWorking || location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    @ViewBuilder private var paymentStep: some View {
        if isPaid {
            ContentUnavailableView("Donation received", systemImage: "checkmark.circle.fill", description: Text("Thank you for supporting community fixes in \(location)."))
                .foregroundStyle(GanamosColor.green)
        } else if let invoice {
            VStack(spacing: 18) {
                if let qr = qrImage(invoice.paymentRequest) {
                    Image(uiImage: qr).interpolation(.none).resizable().scaledToFit()
                        .frame(width: 240, height: 240).padding(14).background(.white, in: RoundedRectangle(cornerRadius: 18))
                }
                Text("\(invoice.amount.formatted()) sats").font(.title.bold())
                Text("Scan with a Lightning wallet or copy the invoice.")
                    .foregroundStyle(GanamosColor.mutedText).multilineTextAlignment(.center)
                Button { UIPasteboard.general.string = invoice.paymentRequest } label: {
                    Label("Copy invoice", systemImage: "doc.on.doc").frame(maxWidth: .infinity).frame(height: 48)
                }.buttonStyle(.borderedProminent).tint(GanamosColor.green)
                ProgressView("Waiting for payment…").tint(GanamosColor.green)
            }.frame(maxWidth: .infinity)
        }
    }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action).font(.headline).foregroundStyle(.black)
            .frame(maxWidth: .infinity).frame(height: 50)
            .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 12))
    }

    private func createInvoice() async {
        isWorking = true; error = nil
        defer { isWorking = false }
        do {
            invoice = try await APIClient.shared.createDonation(
                amount: amount,
                locationType: location == "Global" ? "global" : "custom",
                locationName: location,
                donorName: donorName.nilIfBlank,
                message: message.nilIfBlank)
            step = 3
        } catch { self.error = error.localizedDescription }
    }

    private func pollPayment() async {
        guard let paymentHash = invoice?.paymentHash else { return }
        while !Task.isCancelled && !isPaid {
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            if let status = try? await APIClient.shared.donationStatus(paymentHash: paymentHash), status.settled {
                isPaid = true
                return
            }
        }
    }

    private func qrImage(_ value: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(value.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 9, y: 9)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private struct ProfileDonationSurface<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content.padding(20).frame(maxWidth: .infinity)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(GanamosColor.border))
    }
}

private extension String {
    var nilIfBlank: String? {
        let clean = trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }
}
