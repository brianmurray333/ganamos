# Ganamos iOS

Native SwiftUI client for the existing Ganamos web product and Supabase backend. It intentionally lives beside the Next.js app and does not use a WebView.

## Run locally

1. Copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` if it does not exist.
2. Add the existing Supabase project URL and public anonymous key. Keep the service-role key out of the iOS app.
3. Add the Apple development team and the bundle identifier already registered for TestFlight.
4. Run `xcodegen generate` from this directory.
5. Open `Ganamos.xcodeproj`, choose a simulator or device, and run the `Ganamos` scheme.

Release archives use the `Ganamos App Store Local` provisioning profile for
`com.brianmurray.ganamos` on team `X9XGT7D473`. The profile is configured for
App Store Connect distribution and the matching Apple Distribution certificate.

The first native slice includes email/password authentication with Keychain session storage, a live open-fixes feed, native search and refresh, fix detail, tab navigation, MapKit, photo picking, wallet/profile shells, and native loading/error/empty states.
