import Foundation

struct AppConfiguration: Sendable {
    let apiBaseURL: URL
    let supabaseURL: URL?
    let supabaseAnonKey: String
    var googleMapsAPIKey: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "GANAMOS_GOOGLE_MAPS_API_KEY") as? String,
              !raw.isEmpty,
              !raw.contains("$(") else { return nil }
        return raw
    }

    static let current = AppConfiguration(
        apiBaseURL: bundleURL(named: "GANAMOS_API_BASE_URL") ?? URL(string: "https://www.ganamos.earth")!,
        supabaseURL: bundleURL(named: "GANAMOS_SUPABASE_URL"),
        supabaseAnonKey: Bundle.main.object(forInfoDictionaryKey: "GANAMOS_SUPABASE_ANON_KEY") as? String ?? ""
    )

    var isSupabaseConfigured: Bool {
        supabaseURL != nil && !supabaseAnonKey.isEmpty
    }

    private static func bundleURL(named key: String) -> URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !raw.isEmpty,
              !raw.contains("$(") else { return nil }
        return URL(string: raw)
    }
}
