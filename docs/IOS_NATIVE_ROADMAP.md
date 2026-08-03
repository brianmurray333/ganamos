# Ganamos native iOS roadmap

## Product contract

- Keep the Next.js app operational and reuse the same Supabase data, auth, storage, and server API routes.
- Preserve Ganamos terminology, green/amber visual identity, community-fix workflows, sats rewards, and existing permissions.
- Use native SwiftUI navigation, tabs, sheets, forms, maps, camera/photo picking, sharing, alerts, accessibility, and haptics.
- Keep admin tools web-only unless explicitly prioritized.

## Delivery slices

1. **Foundation (started):** buildable XcodeGen project, five-tab shell, REST client, email/password auth, Keychain session, live open-fixes feed, detail view, search, refresh, MapKit, and photo picker.
2. **Core fixing loop:** profiles/balance, create post with Storage upload and location, claim fix, proof upload, review/approve/reject, group scoping, and account switching.
3. **Community:** groups, invitations/deep links, activity, profile histories, map annotations, filters/sorting, notifications, and universal links.
4. **Money and devices:** Lightning deposit/withdraw/transfer, NWC, transaction history, Satoshi Pet setup/store/device flows, and QR scanning.
5. **Release quality:** offline cache, pagination, analytics/crash reporting, accessibility audit, localization, unit/UI tests, privacy manifest, push entitlements, App Store metadata, and TestFlight lane.

## Backend follow-up

The web client currently performs several direct Supabase table operations. The native app can match this safely under the same RLS policies, but complex multi-write and money-sensitive workflows should use existing server routes or new transactional endpoints rather than duplicating browser action logic in Swift.
