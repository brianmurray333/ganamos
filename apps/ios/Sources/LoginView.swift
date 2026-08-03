import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    SecureField("Password", text: $password).textContentType(.password)
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button { Task { await signIn() } } label: {
                        HStack { Spacer(); if isLoading { ProgressView() } else { Text("Sign In") }; Spacer() }
                    }.disabled(email.isEmpty || password.isEmpty || isLoading)
                }
            }
            .navigationTitle("Welcome back")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func signIn() async {
        isLoading = true; error = nil
        defer { isLoading = false }
        do { try await session.signIn(email: email, password: password) }
        catch { self.error = error.localizedDescription }
    }
}
