import AuthenticationServices
import SwiftUI
import UIKit

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let initialPresentation: AuthPresentation

    @State private var screen: Screen
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var phone = ""
    @State private var verificationCode = ""
    @State private var isLoading = false
    @State private var error: String?
    @State private var confirmationEmail: String?
    @State private var confirmationIsPasswordReset = false
    @State private var googleSession = GoogleAuthSession()

    init(initialPresentation: AuthPresentation = .login) {
        self.initialPresentation = initialPresentation
        _screen = State(initialValue: initialPresentation == .signUp ? .signUpOptions : .loginOptions)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(title)
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)

                    if let confirmationEmail {
                        confirmation(email: confirmationEmail)
                    } else {
                        switch screen {
                        case .signUpOptions: signUpOptions
                        case .emailSignUp: emailSignUp
                        case .loginOptions: loginOptions
                        case .emailLogin: emailLogin
                        case .phone: phoneLogin
                        case .phoneVerification: phoneVerification
                        case .forgotPassword: forgotPassword
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(GanamosColor.canvas.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(GanamosColor.green)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var title: String {
        if confirmationEmail != nil { return "Check your email" }
        switch screen {
        case .loginOptions, .emailLogin: return "Welcome back"
        case .phone: return "Sign in with your phone"
        case .phoneVerification: return "Enter verification code"
        case .forgotPassword: return "Forgot your password?"
        default: return "Create your account"
        }
    }

    private var signUpOptions: some View {
        VStack(spacing: 16) {
            Button {
                Task { await signInWithGoogle() }
            } label: {
                Label("Sign up with Google", image: "GoogleLogo")
                    .authButton(primary: true)
            }

            Button { withAnimation { screen = .emailSignUp } } label: {
                Text("Sign up with email").authButton(primary: false)
            }

            HStack(spacing: 4) {
                Text("Already have an account?").foregroundStyle(GanamosColor.mutedText)
                Button("Log in") { withAnimation { screen = .loginOptions } }
                    .foregroundStyle(GanamosColor.green)
            }
            .font(.subheadline)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
        }
    }

    private var emailSignUp: some View {
        VStack(spacing: 18) {
            fields(nameIncluded: true)
            submitButton("Create account") { await createAccount() }
                .disabled(name.isEmpty || email.isEmpty || password.count < 8 || isLoading)
            Button("Back to all sign up options") { withAnimation { screen = .signUpOptions } }
                .font(.subheadline)
                .foregroundStyle(GanamosColor.green)
        }
    }

    private var loginOptions: some View {
        VStack(spacing: 16) {
            Button { Task { await signInWithGoogle() } } label: {
                Label("Sign in with Google", image: "GoogleLogo").authButton(primary: false)
            }
            Button { withAnimation { screen = .emailLogin } } label: {
                Label("Sign in with email", systemImage: "envelope.fill").authButton(primary: false)
            }
            Button { withAnimation { screen = .phone } } label: {
                Label("Sign in with phone", systemImage: "phone.fill").authButton(primary: false)
            }
            HStack(spacing: 4) {
                Text("Don't have an account?").foregroundStyle(GanamosColor.mutedText)
                Button("Sign up") { withAnimation { screen = .signUpOptions } }
                    .foregroundStyle(GanamosColor.green)
            }
            .font(.subheadline)
            .padding(.top, 8)
        }
    }

    private var emailLogin: some View {
        VStack(spacing: 18) {
            fields(nameIncluded: false)
            Button("Forgot password?") { withAnimation { screen = .forgotPassword } }
                .font(.subheadline)
                .foregroundStyle(GanamosColor.green)
                .frame(maxWidth: .infinity, alignment: .trailing)
            submitButton("Log in") { await signIn() }
                .disabled(email.isEmpty || password.isEmpty || isLoading)
            Button("Back to all sign in options") { withAnimation { screen = .loginOptions } }
                .font(.subheadline).foregroundStyle(GanamosColor.green)
        }
    }

    private var phoneLogin: some View {
        VStack(spacing: 18) {
            Text("By entering your phone number and tapping ‘Send verification code,’ you consent to receive a one-time SMS for login purposes. Message and data rates may apply.")
                .font(.caption).foregroundStyle(GanamosColor.mutedText)
            TextField("Phone number (for example, +1 555 123 4567)", text: $phone)
                .textContentType(.telephoneNumber).keyboardType(.phonePad).authField()
            submitButton("Send verification code") { await sendPhoneCode() }
                .disabled(normalizedPhone.isEmpty || isLoading)
            Button("Back to all sign in options") { withAnimation { screen = .loginOptions } }
                .font(.subheadline).foregroundStyle(GanamosColor.green)
        }
    }

    private var phoneVerification: some View {
        VStack(spacing: 18) {
            Text("Enter the 6-digit code sent to \(phone)")
                .foregroundStyle(GanamosColor.mutedText)
            TextField("123456", text: $verificationCode)
                .keyboardType(.numberPad).textContentType(.oneTimeCode).authField()
                .onChange(of: verificationCode) { _, value in
                    verificationCode = String(value.filter(\.isNumber).prefix(6))
                }
            submitButton("Verify code") { await verifyPhoneCode() }
                .disabled(verificationCode.count != 6 || isLoading)
            Button("Resend code") { Task { await sendPhoneCode(stayOnVerification: true) } }
                .font(.subheadline).foregroundStyle(GanamosColor.green)
            Button("Change phone number") { withAnimation { screen = .phone } }
                .font(.subheadline).foregroundStyle(GanamosColor.green)
        }
    }

    private var forgotPassword: some View {
        VStack(spacing: 18) {
            Text("Enter your email and we'll send you a reset link.")
                .foregroundStyle(GanamosColor.mutedText)
            TextField("your@email.com", text: $email)
                .textContentType(.emailAddress).keyboardType(.emailAddress)
                .textInputAutocapitalization(.never).authField()
            submitButton("Send reset link") { await resetPassword() }
                .disabled(email.isEmpty || isLoading)
            Button("Back to login") { withAnimation { screen = .emailLogin } }
                .font(.subheadline).foregroundStyle(GanamosColor.green)
        }
    }

    private func fields(nameIncluded: Bool) -> some View {
        VStack(spacing: 12) {
            if nameIncluded {
                TextField("Name", text: $name)
                    .textContentType(.name)
                    .submitLabel(.next)
                    .authField()
            }
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .submitLabel(.next)
                .authField()
            SecureField(nameIncluded ? "Create a password" : "Password", text: $password)
                .textContentType(nameIncluded ? .newPassword : .password)
                .submitLabel(.go)
                .authField()
            if nameIncluded {
                Text("Must be at least 8 characters")
                    .font(.caption)
                    .foregroundStyle(GanamosColor.mutedText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
                    .padding(.top, -4)
            }
        }
        .textFieldStyle(.plain)
    }

    private func submitButton(_ label: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Group {
                if isLoading { ProgressView().tint(.black) } else { Text(label).fontWeight(.semibold) }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .foregroundStyle(.black)
            .background(GanamosColor.green, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .overlay(alignment: .bottom) {
            if let error { Text(error).font(.caption).foregroundStyle(.red).offset(y: 24) }
        }
    }

    private func confirmation(email: String) -> some View {
        VStack(spacing: 18) {
            Image(systemName: "envelope.badge")
                .font(.system(size: 44))
                .foregroundStyle(GanamosColor.green)
            Text(confirmationIsPasswordReset
                 ? "We sent a password reset link to \(email). The link expires in 1 hour."
                 : "We sent a confirmation link to \(email). Open it to finish creating your account.")
                .foregroundStyle(GanamosColor.mutedText)
                .multilineTextAlignment(.center)
            Button("Done") { dismiss() }
                .authButton(primary: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
    }

    private func signIn() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { try await session.signIn(email: email, password: password) }
        catch { self.error = error.localizedDescription }
    }

    private func signInWithGoogle() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            let startURL = try await APIClient.shared.googleOAuthURL()
            let callback = try await googleSession.start(url: startURL)
            try await session.completeOAuth(callbackURL: callback)
            dismiss()
        } catch let authError as ASWebAuthenticationSessionError where authError.code == .canceledLogin {
            return
        } catch { self.error = error.localizedDescription }
    }

    private func createAccount() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await session.signUp(email: email, password: password, name: name)
            confirmationEmail = email
        } catch { self.error = error.localizedDescription }
    }

    private var normalizedPhone: String {
        let digits = phone.filter(\.isNumber)
        if phone.trimmingCharacters(in: .whitespaces).hasPrefix("+") { return "+" + digits }
        return digits.count == 10 ? "+1" + digits : digits
    }

    private func sendPhoneCode(stayOnVerification: Bool = false) async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await session.sendPhoneCode(phone: normalizedPhone)
            if !stayOnVerification { withAnimation { screen = .phoneVerification } }
        } catch { self.error = error.localizedDescription }
    }

    private func verifyPhoneCode() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { try await session.verifyPhoneCode(phone: normalizedPhone, code: verificationCode) }
        catch { self.error = error.localizedDescription }
    }

    private func resetPassword() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do {
            try await session.sendPasswordReset(email: email)
            confirmationIsPasswordReset = true
            confirmationEmail = email
        } catch { self.error = error.localizedDescription }
    }

    private enum Screen { case signUpOptions, emailSignUp, loginOptions, emailLogin, phone, phoneVerification, forgotPassword }
}

@MainActor
private final class GoogleAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "ganamos") { callbackURL, error in
                if let callbackURL { continuation.resume(returning: callbackURL) }
                else { continuation.resume(throwing: error ?? APIError.invalidResponse) }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(throwing: APIError.server("Could not start Google sign-in."))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}

private extension View {
    func authField() -> some View {
        self
            .padding(.horizontal, 18)
            .frame(height: 56)
            .background(GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(GanamosColor.border) }
    }

    func authButton(primary: Bool) -> some View {
        self
            .font(.headline)
            .foregroundStyle(primary ? Color.black : Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(primary ? GanamosColor.green : GanamosColor.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 14).stroke(primary ? Color.clear : GanamosColor.border) }
    }
}
