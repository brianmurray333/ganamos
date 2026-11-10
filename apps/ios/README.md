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

## Google Maps (iOS)

The main map screen uses Google Maps SDK for iOS when a Maps API key is present and falls back to MapKit when it isn’t. No keys are committed.

Setup:
- Enable the Maps SDK for iOS in your Google Cloud project.
- Create an API key and restrict it to the bundle ID `com.brianmurray.ganamos` (iOS app restriction).
- Add the key to `Config/Local.xcconfig`:
  - `GANAMOS_GOOGLE_MAPS_API_KEY = <your-ios-maps-sdk-key>`
- Leave `Config/Local.xcconfig.example` empty; do not commit secrets.

Behavior:
- On launch, the app calls `GMSServices.provideAPIKey` with `GANAMOS_GOOGLE_MAPS_API_KEY`.
- If the key is present, the main map uses Google Maps; if missing, it logs a one‑line message and uses MapKit so Debug builds still work without secrets.

Dependency:
- The Google Maps SDK is integrated via Swift Package Manager (`https://github.com/googlemaps/ios-maps-sdk`) in `project.yml`. If you change packages, re-run `xcodegen generate`.
