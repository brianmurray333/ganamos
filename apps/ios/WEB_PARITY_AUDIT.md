# Ganamos Mobile Web → Native iOS Parity Audit

Source of truth: authenticated mobile web at `ganamos.earth`, inspected at a 390 pt viewport.

## Product rules

- Prefer native iOS controls and navigation over literal web-component copies.
- Preserve the web information hierarchy, copy, content, and available actions.
- Use the system `TabView`; iOS 26 supplies Liquid Glass, with native fallback on iOS 17–18.
- Production validation may create test data, but test rewards must never exceed 500 sats.
- Do not execute irreversible Bitcoin sends during visual/functional QA.
- Logged-in approval uses `review_submitted_fix_atomic`: authorization, row locking, ledger credit, balance/pet/count updates, post completion, and activities commit together. Deploy the migration before live native approval testing.

## Core route and state inventory

| Flow | Mobile web behavior | Native status |
|---|---|---|
| Home | Image-led open-job feed, location, time, reward, search, balance/profile access | Mobile-web hierarchy and visual grammar reviewed; native search/filter and system navigation retained as justified iOS affordances |
| Map | Map clusters, search, rewarded filter, map/globe mode, donate/new issue actions | Native search, keyboard dismissal, rewarded filtering, annotation visibility, show-all framing, and Donate entry verified on iOS 17.5 and 26.5 |
| New issue — photo | Camera-first full-screen flow; camera, gallery, skip | Rebuilt native; explicit camera-denial recovery to Photos verified on iOS 17.5 and 26.5 |
| New issue — details | Description, public/group/person audience, location, deadline, 500-sat reward controls, balance validation | Native controls verified on iOS 17.5 and 26.5; keyboard dismissal and location-denial recovery covered by UI tests |
| Post detail | Hero image, share/close, reward, Start, deadline, completion, map | Native visual/status/share/deadline parity; owner reject, approval warning, and 500-sat manual-close confirmation verified on iOS 17.5 and 26.5 without executing a reward transfer; anonymous Lightning payout remains protected web handoff |
| Submit fix | Proof photo/text, claim/submit, review state | Rebuilt native; proof validation and keyboard dismissal verified on iOS 17.5 and 26.5 without submitting a live fix |
| Wallet | Balance + USD, Receive, Send, external wallet prompt, transaction history | Native balance/history and send to username/Lightning; Receive minimum validation, keyboard dismissal, and empty Send validation verified on iOS 17.5 and 26.5 without creating an invoice or sending funds; protected settlement handoff remains pending a dedicated bearer deposit endpoint |
| Profile | Identity, sats/fixes/posts, family accounts, pet, destinations, logout | Corrected to mobile-web parity: side-by-side identity/metrics card, QR badge and native sheet with visible/editable username, tappable balance-to-wallet navigation, four-column family grid, nonduplicated destination list, and accessibility-only stacked layout verified on iOS 17.5 and 26.5 |
| Account settings | Name, username, avatar/profile camera | Native name/username/avatar editing implemented; deterministic username validation and default feed-sort selection verified on iOS 17.5 and 26.5 without saving |
| Groups | Search, create, group list, detail/member/admin/invite flows | Native search/create/list/detail/member/invite, join moderation, role changes, member removal, and destructive group deletion confirmation; populated admin detail, pending/approved members, role/removal menu, invite action, and safe destructive confirmations verified on iOS 17.5 and 26.5 |
| Activity | Mixed activity/transaction timeline with post links | Native merged product-activity and transaction timeline with issue deep links; mixed ordering and issue-detail navigation verified on iOS 17.5 and 26.5 |
| My posts | Authored issue list and status | Native list and fixed-state filtering verified on iOS 17.5 and 26.5; web currently errors on direct load |
| Search | Location/content search, reward/date filters | Native feed and map search with reward/date filter sheet implemented |
| Donate | Amount, location, Lightning invoice, payment status | Native three-step flow and mobile API implemented; amount/location validation and keyboard dismissal verified without creating an invoice; live endpoint deployment/payment verification pending |
| Family/connected accounts | Switch, add, manage/delete child account | Native global balance menu switches between the owner and connected child accounts while excluding quick contacts; kind-aware list/detail navigation, native Send entry, and distinct protected removal paths are verified on iOS 17.5 and 26.5 without mutating data; account creation remains an in-app secure web flow |
| Satoshi pet | Pet home, setup, store, settings, device connect | Native hub and all four destination entries verified on iOS 17.5 and 26.5 without opening protected web flows; device/store subflows remain pending API extraction |
| Authentication | Google, email, phone, register, reset, suspended states | Email/phone/register/reset plus native Google OAuth callback implemented; local option navigation and form validation verified on iOS 17.5 and 26.5 without submitting a request; live redirect allowlist verification pending |

## Audit observations

- The old native `NewFixView` was the original generic SwiftUI `Form` and did not match the live product.
- The live issue composer derives its title from the first 50 description characters rather than requesting a separate title.
- Audience can be public, one of the user's groups, a connected family member, or a searched username.
- The web settings and posts routes intermittently render the profile error boundary on direct navigation; native should provide a stable experience rather than reproduce that defect.
- The native API uses the canonical `create_post_atomic` RPC and passes coordinates, group/person assignment, and expiration.

## Verification checklist

- Build on iOS 17.5 and iOS 26.x simulators.
- Validate Dynamic Type, VoiceOver labels, keyboard dismissal, camera denial, location denial, empty/error/loading states.
- Validate signed-out gating and authenticated account states.
- Exercise all reversible production mutations at 500 sats or less, then clean up test records.
- Perform Design Constitution Review and score at least 43/50 before delivery.

## Current regression evidence

- iOS 17.5: authenticated core navigation, signed-out gating, New Issue deep state, camera/location-denial recovery, Home loading/error/empty states, Wallet Receive/Send validation, owner review/manual close confirmation, and Submit Fix validation pass.
- iOS 26.5: the same coverage passes, including native Liquid Glass tab navigation.
- Profile accessibility XXXL layout passes on iOS 17.5 and 26.5 using a deterministic DEBUG-only Dynamic Type override; the regression now asserts the accessibility-specific identity card before checking content, so it cannot silently exercise the normal layout. The identity/metrics card falls back vertically and the family grid adapts without horizontal clipping.
- Profile mobile-web hierarchy and QR interaction pass against deterministic fixtures on iOS 17.5 and 26.5. The rendered normal-size iOS 26 result was visually compared with the captured mobile web Profile baseline and the required dark technical references.
- Profile balance now preserves the mobile web interaction model by opening the native Wallet screen. The deterministic regression verifies the transition and wallet balance surface on iOS 17.5 and 26.5 without initiating an invoice, transfer, or other production mutation.
- Profile family tiles now preserve the mobile web interaction model by opening the native Send sheet directly with the selected username prefilled. The deterministic regression verifies `marlowe`, confirms Review payment remains disabled without an amount, and closes without initiating a transfer on iOS 17.5 and 26.5.
- Submit Fix remains navigable and keyboard-operable at the maximum accessibility Dynamic Type size on both simulator generations.
- Donate amount/location validation and keyboard dismissal pass without creating an invoice or entering the payment step.
- Map search clearing, keyboard dismissal, rewarded-only filtering, show-all framing, and Donate entry pass against deterministic mixed-reward fixtures on iOS 17.5 and 26.5.
- Populated Groups, a mixed product/transaction Activity timeline, Activity-to-issue detail navigation, and Your Posts fixed-state filtering pass against deterministic fixtures on iOS 17.5 and 26.5.
- Group admin detail passes against deterministic fixtures on iOS 17.5 and 26.5, including pending-member review controls, approved-member role/removal controls, invite availability, and confirmation copy. Tests terminate from destructive confirmations without invoking their handlers.
- Populated Family Accounts list/detail navigation and the Satoshi pet hub pass against deterministic fixtures on iOS 17.5 and 26.5. Add-member, transfer, device, and store actions remain unopened protected web handoffs.
- Account settings populated-state rendering, lowercase username validation, and local default feed-sort selection pass on iOS 17.5 and 26.5. The regression stops before Save Changes and makes no profile request.
- All reward-bearing fixtures and confirmations use exactly 500 sats. No invoice, transfer, issue close, approval, or fix submission was executed by these safety-state tests.
- A stored-session iOS 26.5 regression now opens the live authenticated Profile destinations for Account Settings, Groups, Activity, Posts, and Satoshi pet. It asserts each read-only surface and stops before save, join/create, protected pet, post mutation, transfer, invoice, or payment actions.
- Home's deterministic populated feed and compact balance presentation pass on iOS 17.5 and 26.5. A fresh iOS 26.5 render was visually inspected against the mobile-web `app/page.tsx`/`PostCard` hierarchy and the required technical references: image-led cards, title/location/time ordering, reward marker, restrained dark palette, and feed spacing remain aligned. Native search/filter controls and navigation are intentional platform affordances.
- Authentication option navigation and local validation pass on iOS 17.5 and 26.5 for email login, reset, phone login, and email registration. The regression does not select Google OAuth, Log in, Send reset link, Send verification code, Verify code, or Create account, so it makes no authentication request.
- Signed-out New Issue and Wallet gating pass on iOS 17.5 and 26.5 after the DEBUG-only authentication preview route was added, confirming normal app-root routing still reaches the camera choices and the signed-out wallet actions without a session or network mutation.
- Home's native balance menu now matches mobile web's global account selector: it opens Wallet, switches between the owner and connected child profiles, restores the selected checkmark and balance, excludes quick contacts, and keeps Family management owner-scoped. The focused Home/Family suite passes 3/3 on iOS 17.5 and 26.5 without a network mutation.

## Design Constitution Review

Rendered Home, Map, New Issue, Wallet, Profile, Submit Fix, owner review, close confirmation, and loading/error/empty states were inspected against the required dark technical references.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 4/5 |
| Negative space | 4/5 |
| Typography | 5/5 |
| Alignment / precision | 4/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 4/5 |
| **Total** | **44/50 — pass** |

The final visual correction gives Submit Fix an opaque native navigation-bar background so form content cannot bleed through after keyboard-driven scrolling.

### Profile mobile-web parity review — 2026-08-31

The first render exposed an incorrect normal-size vertical fallback. The second pass explicitly reserves stacking for accessibility Dynamic Type, restoring the web baseline's side-by-side identity and metrics composition while retaining native navigation and the system tab bar.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Global connected-account switching — 2026-09-02 03:45

Mobile web exposes connected-child switching from the global balance menu rather than the Profile family grid. Native Home now preserves that interaction model with a system menu attached to the existing balance pill. The menu shows the current balance, opens the native Wallet, identifies the selected account with a native checkmark, and switches between the authenticated owner and connected child profiles. Quick contacts are deliberately excluded. Session state now keeps the authenticated owner identity separate from the active profile, validates a restored child selection against the owner's current connections, and safely falls back to the owner when that relationship is no longer valid. Family management and removal requests remain owner-scoped through `primaryUserID`.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/account-switcher-targeted-suite-20260902-0345.xcresult` — 3 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/account-switcher-targeted-suite-20260902-0345.xcresult` — 3 passed, 0 failed.
- Direct switcher regressions passed again after correcting owner-ID persistence: `.artifacts/regression/ios26/home-account-switcher-owner-persistence-20260902-0345.xcresult` and `.artifacts/regression/ios17/home-account-switcher-owner-persistence-20260902-0345.xcresult` — 1 passed, 0 failed on each OS.
- Fresh inspected iOS 26.5 menu renders: `tmp/home-account-switcher-ios26-export/DD59E37D-29B3-4C7B-B0BA-705F93C6FBA5.png` and `tmp/home-account-switcher-ios26-export/9A4B7D3F-B759-49C8-B4A2-BDE6F9CCCF0B.png`.
- Fresh inspected compact iOS 17.5 menu renders: `tmp/home-account-switcher-ios17-export/9DC4EDFC-7DE3-4D08-95C2-CCC4D3CD0114.png` and `tmp/home-account-switcher-ios17-export/48B23EA5-D28E-4DE9-8EAB-2BCD8E1EC73B.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png` before implementation. The iOS 26 Liquid Glass menu and iOS 17 compact native menu retain the near-black canvas, one semantic green account/balance accent, quiet section labels, precise alignment, and a clear selected state. Both device classes remain unclipped.
- The live authenticated Profile-destination check skipped because no stored session or test credentials were available. Deterministic owner/child fixtures provided complete switching and owner-scoping coverage without treating missing credentials as a blocker.
- No account relationship, profile, payment, invoice, authentication, production record, or sats balance was mutated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Family detail send-prefill verification — 2026-09-02 02:45

The deeper native Family accounts destination now has deterministic coverage for both relationship kinds entering Send. A child account and a quick contact each open the native Send sheet with the correct username already populated, while Review payment remains disabled because no amount was entered. This preserves the mobile-web direct-recipient interaction and verifies that family management does not lose recipient context. The regression never enters an amount or invokes a wallet request.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/family-send-prefill-20260902-0245.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/family-send-prefill-20260902-0245.xcresult` — 1 passed, 0 failed.
- iOS 26.5 family-management regression suite: `.artifacts/regression/ios26/family-management-suite-20260902-0245.xcresult` — 6 passed, 0 failed.
- iOS 17.5 compact family-management regression suite: `.artifacts/regression/ios17/family-management-suite-20260902-0245.xcresult` — 6 passed, 0 failed.
- Fresh current-device Send renders: `tmp/family-send-prefill-ios26-export/37B965EF-F422-44A6-B3D0-B90ADE4A4229.png` and `tmp/family-send-prefill-ios26-export/1C1AD829-0A7B-49F3-9CDC-94C805942797.png`.
- Fresh compact Send renders: `tmp/family-send-prefill-ios17-export/95BF6C6B-8F13-488C-89A2-8009F2B6585F.png` and `tmp/family-send-prefill-ios17-export/42832062-DC74-4D06-BE47-9B6790F4D7FE.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The native sheet retains the accepted near-black canvas, one clear task, restrained border and metadata treatment, strong field alignment, and deliberately disabled destructive payment emphasis on both device classes.
- No amount was entered and Review payment remained disabled. No payment, invoice, transfer, family mutation, production request, or sats spend occurred.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Family account removal semantics — 2026-09-02 00:45

The Family accounts destination now preserves the relationship type returned by the backend instead of flattening connected child accounts and quick contacts into one undifferentiated array. Rows identify child accounts without exposing destructive controls in the primary Profile grid. The detail screen retains the justified native Send flow and adds a protected native removal entry with type-specific copy and API routing: deleting a child account uses the authenticated soft-delete endpoint and explains that the profile is deactivated while history remains; removing a quick contact deletes only the family relationship and explicitly states that the other Ganamos account is unchanged.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/family-removal-kinds-ios26-final-20260902-0045.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/family-removal-kinds-ios17-final-20260902-0045.xcresult` — 1 passed, 0 failed.
- Existing Family accounts/detail and Satoshi pet navigation regression after the refactor: `.artifacts/regression/family-existing-navigation-ios26-20260902-0045.xcresult` and `.artifacts/regression/family-existing-navigation-ios17-20260902-0045.xcresult` — 1 passed, 0 failed on each OS.
- Fresh current-device renders: `.artifacts/regression/family-removal-kinds-ios26-final-attachments/E801E205-736D-4065-B867-20EF147E69A7.png`, `.artifacts/regression/family-removal-kinds-ios26-final-attachments/2113E876-ED94-449A-96B9-612C5428C429.png`, and `.artifacts/regression/family-removal-kinds-ios26-final-attachments/39639028-D5DC-460F-9121-F99F2D63412A.png`.
- The first visual pass exposed that the destructive detail action inherited the view's green accent. It was revised to semantic red before final verification. The final screens preserve the established near-black canvas, sparse surface hierarchy, quiet metadata, native confirmation treatment, and one green primary action.
- Inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png` before implementation and compared the result with mobile web's Profile account switcher and `FamilySection` removal behavior.
- Both tests stop at the confirmation UI. No child account deletion, family-contact removal, transfer, payment, invoice, production mutation, or sats spend occurred.
- Active child-account switching remains the next family parity slice. It requires owner-versus-active-profile state across SessionStore and every user-scoped API call; quick contacts must remain excluded.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Family removal cancellation safety — 2026-09-02 02:15

The Family accounts removal confirmation now uses a native alert with an explicit Cancel action. The prior confirmation-dialog presentation exposed the correct destructive choice on iOS 26.5 but rendered as a popover without a discoverable cancel control, leaving no clear safe exit. The alert preserves the mobile web flow's type-specific title, explanatory copy, and destructive action while making cancellation obvious on both supported OS generations. A new regression opens and cancels both child-account deletion and quick-contact removal, then verifies that the member detail and destructive control are restored without invoking either removal handler.

Verification evidence:

- Cancellation safety: `.artifacts/regression/ios26/family-removal-cancellation-alert-20260902-0215.xcresult` and `.artifacts/regression/ios17/family-removal-cancellation-alert-20260902-0215.xcresult` — 1 passed, 0 failed on each OS.
- Alert content and relationship-specific copy: `.artifacts/regression/ios26/family-removal-alert-visual-retry-20260902-0215.xcresult` and `.artifacts/regression/ios17/family-removal-alert-visual-retry-20260902-0215.xcresult` — 1 passed, 0 failed on each OS.
- Fresh iOS 26.5 alert renders: `tmp/family-removal-alert-visual-ios26-export/2F457EF2-16E3-42D2-A18E-9F95A10BB6A3.png` and `tmp/family-removal-alert-visual-ios26-export/7EF3A72C-324F-443D-BDF4-FCF90C6F188B.png`.
- Fresh compact iOS 17.5 alert and post-cancel renders: `tmp/family-removal-alert-visual-ios17-export/4A86BD85-4839-47D6-B75E-C46F67A02949.png` and `tmp/family-removal-cancel-ios17-export/7C5DD9A2-F103-405D-9448-9F1BF9DD8DC5.png`.
- The visual screenshot test initially exposed a synthesized-tap miss before the quick-contact alert appeared. It now waits for the relationship-specific alert title before asserting the message and action; the production alert and cancellation tests were already passing.
- Inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png` before implementation. The native alert retains the restrained dark hierarchy, semantic red destructive action, clear green/blue platform cancel affordance, readable multiline copy, and compact-device fit.
- Design Constitution Review: **46/50** — restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. No revision was required after the alert render passed on both device classes.
- No deletion, family relationship mutation, transfer, payment, invoice, production mutation, or sats spend occurred. Active child-account switching remains deferred until SessionStore can preserve the authenticated owner separately from the selected child identity; quick contacts must remain non-switchable.

### Cross-version Profile suite after unnamed-family parity — 2026-09-02 00:15

The complete deterministic Profile regression set was rerun after the unnamed-family `Child` fallback landed. Every covered mobile-web parity state passed on both supported simulator generations: normal and accessibility layouts, avatar editing, QR display/edit/copy fallbacks, family Send routing, empty relationships, pet variants and routing, logout cancellation, wallet navigation, and the configured Admin destination. No production UI change was required in this verification slice.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete deterministic Profile suite: `.artifacts/regression/ios26/profile-suite-after-unnamed-family-20260902-0015.xcresult` — 13 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) complete deterministic Profile suite: `.artifacts/regression/ios17/profile-suite-after-unnamed-family-20260902-0015.xcresult` — 13 passed, 0 failed.
- Fresh current-device Profile and QR renders: `tmp/profile-suite-after-unnamed-family-20260902-0015-ios26-export/C971308E-9500-45A9-88EE-8EC87C8086E2.png` and `tmp/profile-suite-after-unnamed-family-20260902-0015-ios26-export/B3943933-D9CA-4F1C-B463-A78758BD426E.png`.
- Fresh compact Profile and accessibility-XXXL QR renders: `tmp/profile-suite-after-unnamed-family-20260902-0015-ios17-export/D373AF1C-0C9E-4E67-A5DD-A217DB1A4DBE.png` and `tmp/profile-suite-after-unnamed-family-20260902-0015-ios17-export/EF8A627F-8257-40CC-8867-340AF498214E.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile/FamilySection/QR implementations. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. Both device classes preserve the web source's card-first hierarchy, four-column family geometry, muted technical metadata, single semantic green accent, and unclipped QR focal point.
- The removal half of the family deeper-state slice is now implemented with explicit child-account versus quick-contact semantics. Active-account switching remains deferred until native session state can preserve the authenticated owner separately from the selected child profile; quick contacts must never be switchable.
- No family mutation, profile save, logout, payment, invoice, transfer, production mutation, or sats spend occurred.

### Profile unnamed-family label parity — 2026-09-01 23:45

Mobile web labels a family relationship without a display name as `Child`, regardless of whether the record has a username. Native previously exposed that username in the family tile, or displayed `Member` when both values were unavailable. Profile now uses the web source's neutral `Child` fallback for visible and accessibility copy while retaining the justified native Send sheet and its resolvable username prefill. The regression stops before entering an amount or initiating a payment.

Verification evidence:

- iOS 26.5 iPhone 17 Pro edge-state flow: `.artifacts/regression/ios26/profile-unnamed-family-parity-20260901-2345.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) edge-state flow: `.artifacts/regression/ios17/profile-unnamed-family-parity-retry-20260901-2345.xcresult` — 1 passed, 0 failed. The initial retained bundle `.artifacts/regression/ios17/profile-unnamed-family-parity-20260901-2345.xcresult` failed before app launch because CoreSimulator rejected a stale `connectionUUID`; a shutdown/boot of only that simulator cleared the infrastructure error.
- Existing populated-family Profile/QR/Wallet regression after the fallback change: `.artifacts/regression/ios26/profile-named-family-regression-after-child-fallback-20260901-2345.xcresult` and `.artifacts/regression/ios17/profile-named-family-regression-after-child-fallback-20260901-2345.xcresult` — 1 passed, 0 failed on each OS.
- Fresh current-device Profile and Send renders: `tmp/profile-unnamed-family-parity-20260901-2345-ios26-export-2/E7AF641B-729F-44CD-ADC5-198F7FFE537D.png` and `tmp/profile-unnamed-family-parity-20260901-2345-ios26-export-2/482D0914-D79B-4E62-ADF7-2A3125EF29A9.png`.
- Fresh compact Profile and Send renders: `tmp/profile-unnamed-family-parity-20260901-2345-ios17-export-2/447521BA-9D17-4F55-AFC1-34DED1B6B34C.png` and `tmp/profile-unnamed-family-parity-20260901-2345-ios17-export-2/62139EFE-EDC5-4D5E-B5A7-270FB3E9E025.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's `FamilySection`. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The corrected one-word label preserves the accepted four-column geometry, muted balance treatment, single green QR accent, and unclipped native Send handoff on both device classes.
- No family mutation, profile save, payment, invoice, transfer, production mutation, or sats spend occurred.

### Profile avatar-editor interaction closure — 2026-09-01 23:15

Mobile web makes the Profile avatar an explicit picture-editing entry. Native already used the avatar as a direct link to its superior system-backed Account settings editor, but that interaction was not independently covered. A deterministic regression now taps the Profile avatar, verifies the populated native editor and Photo Library action, and confirms that no Save Changes action is exposed before a local edit. It stops before selecting a photo, opening the camera, or issuing a profile request. No production UI changed.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-avatar-native-editor-20260901-2315.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/profile-avatar-native-editor-20260901-2315.xcresult` — 1 passed, 0 failed.
- Fresh Profile and native editor renders: `tmp/profile-avatar-native-editor-20260901-2315-ios26-export/D55046DB-3425-435B-9077-DBC2F8B28DCB.png`, `tmp/profile-avatar-native-editor-20260901-2315-ios26-export/96D360ED-7236-4C54-905B-1A4D3A789357.png`, `tmp/profile-avatar-native-editor-20260901-2315-ios17-export/E3C5495C-5571-4473-8C21-1197F5D86EC8.png`, and `tmp/profile-avatar-native-editor-20260901-2315-ios17-export/F78FA8A8-1AD0-48D1-9E36-F06FA05C9E24.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile avatar interaction. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The handoff preserves the accepted Profile hierarchy and opens a focused native editor with one dominant avatar, quiet chrome, restrained green action color, and unclipped fields on both device classes.
- No camera, photo picker, profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

### Cross-version Profile suite after unnamed-pet parity — 2026-09-01 22:15

The complete expanded Profile regression set was run serially after the unnamed connected-pet and identity-edge corrections. iOS 26.5 passed every deterministic flow. The compact iOS 17.5 suite passed eleven deterministic flows and exposed one test-only synthesized-tap miss on the account-ID QR copy control; the product had already rendered the correct account UUID and copy action. That fallback regression now uses the same semantic-then-stable-center transition helper already proven by the primary username-copy path. The repaired flow passed on both OS generations.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete expanded Profile suite: `.artifacts/regression/ios26/profile-suite-after-unnamed-pet-20260901-2215.xcresult` — 12 passed, 0 failed, 1 credential-dependent authenticated test skipped.
- Initial iOS 17.5 iPhone SE (3rd generation) expanded Profile suite: `.artifacts/regression/ios17/profile-suite-after-unnamed-pet-20260901-2215.xcresult` — 11 passed, 1 synthesized-tap failure, 1 credential-dependent authenticated test skipped; retained as diagnostic evidence.
- Hardened account-ID copy flow: `.artifacts/regression/ios17/profile-account-copy-hardening-20260901-2215.xcresult` and `.artifacts/regression/ios26/profile-account-copy-hardening-20260901-2215.xcresult` — 1 passed, 0 failed on each OS.
- Fresh iOS 26.5 Profile and unnamed connected-pet renders: `tmp/profile-suite-after-unnamed-pet-20260901-2215-ios26-export/FFDE2305-7C7C-4F55-A6FF-BFFD5791963B.png` and `tmp/profile-suite-after-unnamed-pet-20260901-2215-ios26-export/8BDBC950-3D0D-4F31-A54E-97DF57F18F13.png`.
- Fresh compact iOS 17.5 copied account-ID render: `tmp/profile-account-copy-hardening-20260901-2215-ios17-export/E440FBC7-EAB2-4800-9D0A-2C000B3B29AB.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile/QR implementation. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The root preserves its card-first hierarchy and precise four-column grid; the active unnamed-pet state remains legible without adding a new accent; the compact QR retains one dominant focal point, quiet monospaced identity, and restrained green completion feedback without clipping or overlap.
- The next focused verification is a complete compact iOS 17.5 suite rerun with the account-ID tap hardening. No production UI changed in this follow-up.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

### Profile unnamed-connected-pet parity — 2026-09-01 21:45

Mobile web treats the presence of a device row as a connected pet even when `pet_name` and `pet_type` have not been personalized: it displays `Pet`, uses the default cat glyph with the active gradient treatment, and routes to `/pet-settings`. Native previously required both fields during decoding, so the entire device row was discarded and Profile incorrectly showed the disconnected `Connect Pet` state. `UserPet` now decodes null or empty personalization into the same active mobile-web fallbacks.

Verification evidence:

- Decoder regression for both null and empty API shapes: `.artifacts/regression/ios26/profile-unnamed-pet-decoding-final-20260901-2145.xcresult` — 1 passed, 0 failed.
- iOS 26.5 iPhone 17 Pro Profile state: `.artifacts/regression/ios26/profile-unnamed-pet-parity-20260901-2145.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) compact Profile state: `.artifacts/regression/ios17/profile-unnamed-pet-parity-20260901-2145.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 and compact iOS 17.5 renders: `tmp/profile-unnamed-pet-parity-20260901-2145-ios26-export/0F14E909-F4B9-400B-8E81-F00EACDBE274.png` and `tmp/profile-unnamed-pet-parity-20260901-2145-ios17-export/B977F14B-71F8-4CE7-84D1-D4A8D32BF88A.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's connected-pet row. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The change preserves the accepted card geometry and uses the existing single semantic gradient for the active pet state; both device sizes remain unclipped and immediately legible.
- No pet update, profile save, account switch, logout, payment, invoice, transfer, family mutation, issue creation, production mutation, or sats spend occurred.

### Profile QR missing-name fallback parity — 2026-09-01 21:15

Mobile web keeps the QR identity zone populated with `User` when a profile name is null or an empty string. Native previously normalized only null to `Ganamos member`; an empty API value collapsed the visible title above the QR code. The native sheet now applies the exact mobile-web fallback to both missing-name representations without changing the Profile root, QR payload, username editing, or copy behavior.

Verification evidence:

- iOS 26.5 iPhone 17 Pro missing-name Profile/QR flow: `.artifacts/regression/ios26/profile-qr-name-fallback-20260901-2115.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) compact missing-name Profile/QR flow: `.artifacts/regression/ios17/profile-qr-name-fallback-20260901-2115.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 and compact iOS 17.5 QR renders: `tmp/profile-qr-name-fallback-20260901-2115-ios26-export/A5DCA89F-8F43-4F27-A63E-FE3AA0D68F03.png` and `tmp/profile-qr-name-fallback-20260901-2115-ios17-export/43696FE0-8C53-4271-9A3E-97F5AE19AA04.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's `UserQRModal`. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The restored one-word identity keeps a clear title/content/QR hierarchy, precise center alignment, restrained monochrome typography, and the QR as the single dominant focal point on both device classes.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

### Profile configured-admin destination parity — 2026-09-01 20:45

Mobile web conditionally inserts an `Admin` row between Posts and Log out when the signed-in email matches `NEXT_PUBLIC_ADMIN_EMAIL`. Native already had a read-only `AdminView`, but Profile never exposed it. Profile now applies the same email-gated content model through the non-secret `GANAMOS_ADMIN_EMAIL` build setting, compares case-insensitively, and keeps the row absent when the setting is missing or the account does not match. The existing native dashboard remains the justified platform-specific destination, with its full web admin tools available only through the explicit handoff button.

Verification:

- iOS 26.5 iPhone 17 Pro admin Profile-to-dashboard flow: `.artifacts/regression/ios26/profile-admin-parity-fixed-20260901-2045.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) admin Profile-to-dashboard flow: `.artifacts/regression/ios17/profile-admin-parity-20260901-2045.xcresult` — 1 passed, 0 failed.
- Regular-account Profile/QR/Send/Wallet flow, including absence of the Admin row: `.artifacts/regression/ios26/profile-regular-admin-gate-20260901-2045.xcresult` and `.artifacts/regression/ios17/profile-regular-admin-gate-20260901-2045.xcresult` — 1 passed, 0 failed on each OS.
- Fresh dashboard renders: `tmp/profile-admin-parity-20260901-2045-ios26-fixed-export/A3D42C81-1E93-4D13-BD7A-660BEE53AF11.png` and `tmp/profile-admin-parity-20260901-2045-ios17-export/06019AF2-9C05-4336-A062-C5EB54F2692C.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile menu order. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The conditional row preserves the source order without introducing a new visual treatment; the destination keeps one dominant Dashboard heading, aligned two-column metrics, restrained semantic color, and ample breathing room on both compact and current devices.
- No admin action, web handoff, production mutation, payment, invoice, transfer, or sat spend was initiated.

### Profile empty-username normalization parity — 2026-09-01 20:15

Mobile web treats both a null username and an empty username as unclaimed: the Profile identity line displays `@username`, while the QR sheet encodes and copies the stable account UUID. Native previously normalized only the null state. An API row containing `username: ""` therefore rendered a bare `@`, generated an empty QR payload, and disabled account-ID copying. Profile and its QR sheet now share the mobile-web fallback semantics for this edge state. The deterministic fixture carries an empty string so the existing fallback regression cannot pass by exercising only decoded null.

Verification evidence:

- iOS 26.5 iPhone 17 Pro empty-username Profile/QR fallback: `.artifacts/regression/ios26/profile-empty-username-parity-20260901-2015.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) empty-username Profile/QR fallback: `.artifacts/regression/ios17/profile-empty-username-parity-20260901-2015.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 Profile and copied account-ID QR renders: `tmp/profile-empty-username-parity-20260901-2015-ios26-export/DFB4A28B-88AB-4F23-824D-C6CA4BEABEC0.png` and `tmp/profile-empty-username-parity-20260901-2015-ios26-export/A9E43A37-D053-435C-AA2F-B4976078062F.png`.
- Fresh compact iOS 17.5 Profile and copied account-ID QR renders: `tmp/profile-empty-username-parity-20260901-2015-ios17-export/39245646-F9E1-4374-89FA-84C4FABC0AF6.png` and `tmp/profile-empty-username-parity-20260901-2015-ios17-export/69A9B200-A305-4E8A-8E46-6977809EF4FC.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile/QR implementation. Design Constitution Review remains **46/50**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color 5, engineered feel 4, comprehension 5, reference match 5. The correction changes only fallback data semantics; both device sizes retain the accepted card geometry, quiet technical identity treatment, strong QR focal point, and restrained completion accent.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

### Profile username-placeholder content parity — 2026-09-01 19:45

Mobile web keeps the identity line visible when an account has not claimed a username, rendering `@username` beneath the first name. Native previously rendered an empty string for the same state, leaving a visible hierarchy gap above the metrics baseline. The native Profile card now preserves the mobile-web fallback while the QR sheet continues to use the account UUID as its safe connection and copy value.

Verification evidence:

- iOS 26.5 iPhone 17 Pro no-username Profile/QR fallback: `.artifacts/regression/ios26/profile-username-placeholder-parity-20260901-1945.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) no-username Profile/QR fallback: `.artifacts/regression/ios17/profile-username-placeholder-parity-20260901-1945.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 and compact iOS 17.5 Profile renders: `tmp/profile-username-placeholder-parity-20260901-1945-ios26-export/B2116979-B591-4146-8289-7FE5CA8D1CEF.png` and `tmp/profile-username-placeholder-parity-20260901-1945-ios17-export/0213D837-E5C0-4432-A042-38433619C6D5.png`.
- Visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile implementation. The restored quiet identity label preserves the card's deliberate vertical rhythm, muted technical hierarchy, restrained palette, and compact-device alignment without introducing a new focal point.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. No revision was required.

### Profile QR compact-tap regression hardening — 2026-09-01 19:06

A fresh serial Profile-suite run after the username-copy feedback coverage passed all nine flows on iOS 26.5. The compact iOS 17.5 run passed eight flows and isolated one automation failure in the terminal Profile/Send/QR/edit/Wallet flow: the product rendered correctly, but XCUI dropped the synthesized tap on the QR row's trailing copy control, then also dropped the navigation-back tap while the test continued after the first failure. The regression now reuses the existing semantic-then-stable-center transition helper for both controls and requires their destination states before continuing. The unchanged product flow then passed in isolation on both OS generations.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete Profile suite before the test-only hardening: `.artifacts/regression/ios26/profile-suite-after-copy-feedback-20260901-1845.xcresult` — 9 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) complete Profile suite before hardening: `.artifacts/regression/ios17/profile-suite-after-copy-feedback-20260901-1845.xcresult` — 8 passed, 1 synthesized-tap failure in the terminal flow; retained as diagnostic evidence.
- Final hardened terminal flow: `.artifacts/regression/ios17/profile-copy-tap-hardening-20260901-1845.xcresult` and `.artifacts/regression/ios26/profile-copy-tap-hardening-20260901-1845.xcresult` — 1 passed, 0 failed on each OS.
- Fresh iOS 26.5 Profile and completed-copy QR renders: `tmp/profile-copy-tap-hardening-20260901-1845-ios26-export/AC0F7CDA-5353-4377-900D-3E2E5C874BE5.png` and `tmp/profile-copy-tap-hardening-20260901-1845-ios26-export/559C124A-C516-4C26-9D7E-7B7FC39D5D1F.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile/QR implementation. The accepted card-first hierarchy, four-column grid, QR focal point, restrained green completion state, and compact technical labeling remain intact without clipping or overlap.
- The pending compact iOS 17.5 nine-flow serial rerun is completed in the closure immediately below. No production UI changed in this follow-up.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5.

### Compact iOS 17 Profile-suite closure after QR tap hardening — 2026-09-01 19:15

The pending compact-device verification is complete. The full nine-flow Profile suite passed serially on iPhone SE (3rd generation) / iOS 17.5 with the test-only semantic-then-stable-center transitions. This confirms the QR username-copy completion state and Account Settings return path remain reliable under full-suite simulator load without changing production UI.

Verification evidence:

- iOS 17.5 iPhone SE (3rd generation) complete Profile suite: `.artifacts/regression/ios17/profile-suite-compact-after-qr-hardening-20260901-1915.xcresult` — 9 passed, 0 failed.
- Fresh exported Profile, QR copied state, QR accessibility XXXL, account-ID fallback, empty relationships, logout confirmation, pet routing, squirrel icon, and destination renders: `tmp/profile-suite-compact-after-qr-hardening-20260901-1915-export/`.
- Visually inspected the compact Profile root, copied-state QR sheet, and accessibility XXXL QR sheet against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile/QR hierarchy. The root retains its card-first composition and four-column family grid; both QR states keep one dominant focal point, restrained semantic green, quiet technical identity copy, and separate title/content zones without clipping or overlap.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. No revision was required.

### Profile QR username-copy feedback closure — 2026-09-01 18:15

The username QR path already exposed a native copy action, but only the no-username account-ID fallback asserted its completed state. The primary Profile regression now copies the visible username, verifies the action changes from `Copy username` to `Copied`, and confirms the displayed identity remains unchanged before entering native Account Settings. This closes the safe interaction gap without reading pasteboard contents or mutating the profile.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete Profile/Send/QR copy/edit/Wallet flow: `.artifacts/regression/ios26/profile-qr-copy-feedback-20260901-1815.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) complete Profile/Send/QR copy/edit/Wallet flow: `.artifacts/regression/ios17/profile-qr-copy-feedback-20260901-1815.xcresult` — 1 passed, 0 failed.
- Fresh Profile and copied-state QR renders: `tmp/profile-qr-copy-feedback-20260901-1815-ios26-export/1D484C33-2E81-4BAA-B04D-583A0E476CE2.png` and `tmp/profile-qr-copy-feedback-20260901-1815-ios26-export/22B10FC2-6C8B-4A74-B426-A02C0591A245.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and mobile web's Profile/QR implementation. The copied checkmark remains a restrained semantic accent, the QR stays the single focal point, and neither render shows clipping, overlap, or hierarchy drift.
- The active-account switcher remains intentionally deferred until owner-versus-active-profile session state exists; quick contacts must not be presented as switchable accounts.
- No profile save, account switch, logout, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5.

### Compact iOS 17 Profile-suite closure — 2026-09-01 17:45

The complete deterministic Profile suite was rerun serially on the compact iPhone SE after the logout synthesized-tap hardening. All nine flows now pass together in one clean result bundle, closing the prior evidence gap where eight suite cases passed and the repaired logout case had only been rerun in isolation. The suite covers the mobile-web identity/metrics hierarchy, native family Send handoff, QR and account-ID fallback states, accessibility XXXL layouts, empty relationships, connected/disconnected pet routes, squirrel semantics, safe logout cancellation, and deeper Profile destinations.

Verification evidence:

- iOS 17.5 iPhone SE (3rd generation) complete Profile suite: `.artifacts/regression/ios17/profile-suite-compact-clean-20260901-1745.xcresult` — 9 passed, 0 failed.
- Fresh compact Profile, QR, and QR accessibility renders: `tmp/profile-suite-compact-clean-20260901-1745-export/C166342D-B817-47B1-B038-2AF1BD71E169.png`, `tmp/profile-suite-compact-clean-20260901-1745-export/9189F0F6-082E-430D-806E-8735B1A7ACAA.png`, and `tmp/profile-suite-compact-clean-20260901-1745-export/8F504EEB-1880-4E52-85C4-1C19F95CDC5D.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. Screenshot critique found no clipping, unintended overlap, hierarchy drift, or inaccessible compact control. No production UI changed in this closure.
- No logout, profile save, account switch, payment, invoice, transfer, pet/family mutation, issue creation, production mutation, or sats spend occurred.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile source-spacing parity and terminal-flow timing hardening — 2026-09-01 13:45

The mobile-web Profile root applies `pt-6` (24 px) before its first identity surface. Native was using 16 pt after the safe area, pulling the card eight points above the source layout. The root now preserves the same 24 pt breathing room without changing the card hierarchy, content, system safe area, or native navigation behavior.

The first two iOS 26.5 terminal-flow attempts exposed separate synthesized-tap races after the correct Profile screenshot had already been captured: the family Send sheet did not present once, and Wallet navigation did not present once. Both controls were present and hittable, and the same production build passed those interactions on iOS 17.5. The terminal regression now reuses the existing semantic-then-center tap helper for both transitions. Final unchanged-product runs passed on both OS generations.

Verification evidence:

- iOS 26.5 iPhone 17 Pro final Profile/Send/QR/Wallet flow: `.artifacts/regression/ios26/profile-top-spacing-final-20260901-1345.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro final Profile/Send/QR/Wallet flow: `.artifacts/regression/ios17/profile-top-spacing-final-20260901-1345.xcresult` — 1 passed, 0 failed.
- Superseded iOS 26 timing evidence retained at `.artifacts/regression/ios26/profile-top-spacing-20260901-1345.xcresult` and `.artifacts/regression/ios26/profile-top-spacing-rerun-20260901-1345.xcresult`.
- Fresh Profile, native Send, QR, and Wallet renders: `tmp/profile-top-spacing-final-20260901-1345-export/`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and `app/profile/page.tsx`. No login, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. The extra eight points restore source spacing and improve the top-level pause without weakening information density.

### Profile compact-width QR layout closure — 2026-09-01 14:45

The 4.7-inch iPhone verification preserved the mobile-web Profile hierarchy and all four family columns, but its rendered QR sheet exposed identity copy overlapping the inline native navigation title at a fractional detent. The sheet now uses the full-height native detent so the title, account identity, QR image, and copy action retain separate layout zones on every supported height. A frame-separation assertion prevents the visual overlap from passing as a merely tappable interface again.

Verification evidence:

- iOS 17.5 iPhone SE (3rd generation) complete Profile/Send/QR/Wallet flow: `.artifacts/regression/ios17/profile-compact-qr-layout-final-20260901-1445.xcresult` — 1 passed, 0 failed.
- iOS 26.5 iPhone 17 Pro complete Profile/Send/QR/Wallet flow: `.artifacts/regression/ios26/profile-qr-layout-final-20260901-1445.xcresult` — 1 passed, 0 failed.
- Fresh compact-width Profile and corrected QR renders: `tmp/profile-compact-qr-layout-final-20260901-1445-export/154A85C7-63EC-4BCA-9E21-1ACE311B630A.png` and `tmp/profile-compact-qr-layout-final-20260901-1445-export/8DF379B5-43EB-42CE-B9EC-4C80A195FE70.png`.
- Fresh iOS 26.5 corrected QR render: `tmp/profile-qr-layout-final-20260901-1445-export/034B02E8-2332-4807-BA2A-C962C91439E2.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and `app/profile/page.tsx`. No login, payment, invoice, transfer, family/pet mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. The corrected sheet keeps one dominant QR focal point, quiet native chrome, direct copy action, and generous but controlled negative space.

Remaining Profile interaction gap for a future focused change: mobile web shows an active-account switcher beside the first name when true connected child accounts exist. Native currently has only one session user identifier and merges child accounts with quick contacts in `ProfileOverview`, so a cosmetic menu would be unsafe and incomplete. Implement owner-versus-active-profile session state before exposing this control; do not treat quick contacts as switchable accounts.

### Profile QR identity and edit parity — 2026-09-01 15:15

The mobile-web QR dialog shows the encoded username beneath the QR and makes that row an entry point for username editing. Native previously encoded the correct value but hid it, leaving only a generic full-width Copy username action. The native sheet now exposes the same `@username` in a compact monospaced row, keeps a distinct copy control, and routes the edit affordance to the existing native Account settings screen. This preserves the source content and action model while using the safer native form instead of duplicating username validation inside the sheet. Account-ID fallback copy remains available for profiles without a username.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete Profile/Send/QR/edit/Wallet flow: `.artifacts/regression/ios26/profile-qr-identity-edit-parity-20260901-1515.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) compact-height flow: `.artifacts/regression/ios17/profile-qr-identity-edit-compact-20260901-1515.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 QR and native edit renders: `tmp/profile-qr-identity-edit-parity-20260901-1515-ios26/789C3E13-EF98-4253-A44D-D37F41FD91E8.png` and `tmp/profile-qr-identity-edit-parity-20260901-1515-ios26/ADEE776C-D373-4BD3-860D-A379C1B09B59.png`.
- Fresh compact iOS 17.5 QR render: `tmp/profile-qr-identity-edit-parity-20260901-1515-ios17/C930EA5C-6155-485C-A5DD-9B203E5C7CF0.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, `components/user-qr-modal.tsx`, and `app/profile/page.tsx`. The test stops before Save Changes; no profile mutation, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. The QR remains the single focal point; the added row is compact, visually quiet, semantically direct, and preserves the reference grammar's restrained technical labeling.

### Profile QR account-ID fallback verification — 2026-09-01 15:45

The QR sheet's no-username path now has deterministic cross-version coverage. When a profile has no username, the native sheet encodes and displays the stable account UUID, labels the secondary action `Copy account ID`, and changes its confirmation state to `Copied` after the pasteboard write. This closes the fallback claimed by the mobile-web parity implementation without changing production behavior or requiring a profile mutation.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-qr-account-id-fallback-20260901-1545.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/profile-qr-account-id-fallback-20260901-1545.xcresult` — 1 passed, 0 failed.
- Fresh copied-state renders: `tmp/profile-qr-account-id-fallback-20260901-1545-ios26/1ECF416F-B142-4979-9DE8-F2A9ED0CFAC7.png` and `tmp/profile-qr-account-id-fallback-20260901-1545-ios17/CAE5E128-24B3-48A7-93CF-C895E2199C04.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the accepted username QR render. No profile save, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. Both compact and current-device renders preserve the QR as the focal point, keep the UUID quiet and technical, and make the copied state legible without adding decorative chrome.

### Profile QR live-identity parity — 2026-09-01 16:15

The mobile-web QR dialog reads identity from the current authenticated profile, so a confirmed username edit immediately replaces both its displayed identity and encoded QR value. Native had passed a username/account-ID snapshot into the sheet when it opened. A successful save in the pushed native Account settings screen refreshed `SessionStore`, but the still-open QR sheet retained its original value until dismissal and reopening. The sheet now reads its name, username, and account ID directly from the shared session and clears stale copied feedback whenever that identity changes. The existing native validation and save flow remain the justified platform-specific control.

Verification evidence:

- iOS 26.5 iPhone 17 Pro Profile/Send/QR/edit/Wallet and account-ID fallback pair: `.artifacts/regression/ios26/profile-qr-live-identity-20260901-1615.xcresult` — 2 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) compact-height pair: `.artifacts/regression/ios17/profile-qr-live-identity-20260901-1615.xcresult` — 2 passed, 0 failed.
- Fresh iOS 26.5 Profile, username QR, and copied account-ID renders: `tmp/profile-qr-live-identity-20260901-1615-ios26/BB4A3E7C-9A8F-427C-8C7D-E291BB49DE69.png`, `tmp/profile-qr-live-identity-20260901-1615-ios26/0FE18F29-E03F-42D0-9A70-F4B82BD7A50B.png`, and `tmp/profile-qr-live-identity-20260901-1615-ios26/A3BD89B5-6D9A-4DA4-B83B-D4121AE37DD9.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, `components/user-qr-modal.tsx`, and `app/profile/page.tsx`. Tests stop before Save Changes; no profile mutation, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. The refreshed renders retain the QR as the only focal point, quiet technical identity labeling, one semantic green action state, and the mobile-web spacing hierarchy.

### Profile QR accessibility closure — 2026-09-01 16:45

The Profile root already had accessibility Dynamic Type coverage, but its QR destination had only been verified at the default text size. A dedicated regression now opens the QR sheet at accessibility XXXL, verifies the identity content stays below the native navigation title, keeps the copy action inside the compact viewport, and confirms that action remains hittable. No production UI changed.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-qr-accessibility-20260901-1645.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/profile-qr-accessibility-20260901-1645.xcresult` — 1 passed, 0 failed.
- Fresh accessibility renders: `tmp/profile-qr-accessibility-20260901-1645-ios26/DC08AD6A-D8E9-4107-87D2-A69A7A6C4F9C.png` and `tmp/profile-qr-accessibility-20260901-1645-ios17/CE417BB9-A51F-4FC1-BECC-39BBCB79E095.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile/QR implementations. No profile save, account switch, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. Both renders keep the QR as the single focal point, use quiet technical identity text, and preserve generous negative space without clipping the native action chrome.

### Cross-version Profile suite and compact logout-tap hardening — 2026-09-01 17:15

The complete deterministic Profile suite was rerun serially after the QR identity, compact-layout, fallback, live-session, and accessibility changes. iOS 26.5 passed all nine Profile flows. On the compact iOS 17.5 simulator, eight flows passed and the logout-cancellation flow exposed a synthesized-tap miss: the scrolled Log out control remained visible, no confirmation was presented, and the test then correctly failed its title and message assertions. The test now uses the existing semantic-then-stable-center transition helper before validating confirmation copy. The unchanged production confirmation passed on compact iOS 17.5 and iOS 26.5 after that test-only hardening.

Verification evidence:

- iOS 26.5 iPhone 17 Pro complete Profile suite: `.artifacts/regression/ios26/profile-suite-after-qr-accessibility-20260901-1715.xcresult` — 9 passed, 0 failed.
- Initial iOS 17.5 iPhone SE (3rd generation) suite: `.artifacts/regression/ios17/profile-suite-after-qr-accessibility-20260901-1715.xcresult` — 8 passed, 1 synthesized-tap failure.
- Compact iOS 17.5 hardened logout flow: `.artifacts/regression/ios17/profile-logout-compact-tap-hardening-20260901-1715.xcresult` — 1 passed, 0 failed.
- iOS 26.5 hardened logout flow: `.artifacts/regression/ios26/profile-logout-tap-hardening-20260901-1715.xcresult` — 1 passed, 0 failed.
- Fresh compact Profile, accessibility QR, and corrected logout-confirmation renders: `tmp/profile-suite-after-qr-accessibility-20260901-1715-ios17-export/4B3C276E-3576-4C50-AF6F-51E2C8DB73DB.png`, `tmp/profile-suite-after-qr-accessibility-20260901-1715-ios17-export/8642AFC1-CF23-4EB4-9E94-98CDD015B2AD.png`, and `tmp/profile-logout-tap-hardening-20260901-1715-ios17/D7529629-9906-4DD5-B674-DCAA84883F6A.png`.
- Fresh iOS 26.5 native confirmation render: `tmp/profile-logout-tap-hardening-20260901-1715-ios26/4B8FFCB4-BE63-4DBD-B460-F899C42D86C1.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. No logout, profile save, account switch, payment, invoice, transfer, pet/family mutation, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**: restraint 5, hierarchy 5, negative space 4, typography 4, alignment 5, visualization 4, color discipline 5, premium feel 4, comprehension 5, reference match 5. The refreshed compact and current-device renders retain the accepted web-mobile hierarchy, calm spacing, one dominant QR focal point, and native confirmation chrome without adding decorative UI.

### Serial iOS 26 full-suite closure — 2026-09-01 13:15

The pending serial full-suite run confirmed the Passwords-prompt hardening, then exposed one unrelated simulator scheduling edge: the empty Family accounts destination was still showing its activity indicator when the five-second empty-state assertion expired. The exported failure frame and accessibility hierarchy showed the correct destination, Shared family access card, Add action, and loading indicator. The same flow passed immediately in isolation. Its async assertion now uses the existing 15-second destination margin; production UI and request behavior are unchanged.

Verification evidence:

- Initial iOS 26.5 serial suite: `.artifacts/regression/ios26/full-suite-after-auth-hardening-20260901-1315.xcresult` — 23 passed, 1 fixture-loading timing failure, 2 credential-dependent tests skipped.
- Immediate unchanged empty-relationship rerun: `.artifacts/regression/ios26/profile-empty-after-full-suite-20260901-1315.xcresult` — 1 passed, 0 failed.
- Empty-relationship timing-hardening repetition: `.artifacts/regression/ios26/profile-empty-timing-hardening-20260901-1315.xcresult` — 3 passed, 0 failed.
- Final iOS 26.5 serial suite: `.artifacts/regression/ios26/full-suite-final-after-timing-hardening-20260901-1315.xcresult` — 24 passed, 0 failed, 2 credential-dependent tests skipped.
- Exported loading-state evidence: `tmp/full-suite-after-auth-hardening-20260901-1315-export/14A24D98-7385-4B38-BE2E-1B61CF5C1FDB.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The inspected native Family destination retains the accepted near-black canvas, clear hierarchy, restrained borders, and direct action emphasis. No login, reset, SMS, registration, family mutation, payment, invoice, transfer, issue creation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**; no visual implementation changed in this follow-up.

### Authentication Passwords-prompt timing hardening — 2026-09-01 12:45

The first serial iOS 26.5 full-suite run after the earlier timing fixes exposed a separate cross-process automation race in the local authentication regression: the system Passwords `Not Now` control accepted a semantic XCUI tap but remained presented, blocking every subsequent app control. The shared prompt helper now retries the proxied control at its stable center and, only when the prompt is expected and still visible, uses the existing iOS 26 system-sheet coordinate fallback. No authentication request or credential submission occurs in this test.

Verification evidence:

- iOS 26.5 iPhone 17 Pro isolated authentication flow: `.artifacts/regression/ios26/auth-password-prompt-hardening-20260901-1245.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro isolated authentication flow: `.artifacts/regression/ios17/auth-password-prompt-hardening-20260901-1245.xcresult` — 1 passed, 0 failed.
- Fresh iOS 26.5 Profile hierarchy/QR/family-send/balance flow: `.artifacts/regression/ios26/profile-after-auth-hardening-20260901-1245.xcresult` — 1 passed, 0 failed.
- Fresh visually inspected Profile render: `tmp/profile-after-auth-hardening-20260901-1245-export/12B4CD8E-360E-46E9-9486-CEC1AF636746.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. No login, reset, SMS, registration, payment, invoice, transfer, or production mutation was initiated.

The fresh Profile render retains the accepted mobile-web card-first hierarchy, restrained border and accent use, four-column family grid, clear data zones, and unboxed destination list. Native navigation and system controls remain the only platform-specific divergence.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile logout-confirmation parity — 2026-09-01 12:15

The Profile route inventory included logout but did not have deterministic interaction coverage. A cancellation-only regression now opens the native destructive confirmation, verifies its complete warning copy, and dismisses it without signing out. The test follows each OS's system behavior: iOS 17.5 exposes an explicit Cancel action, while iOS 26.5 presents a dismissible confirmation popover whose native cancellation path is the surrounding scrim. Both paths verify that the authenticated Profile remains intact afterward.

Verification evidence:

- iOS 26.5 iPhone 17 Pro final Profile hierarchy/logout pair: `.artifacts/regression/ios26/profile-logout-regression-final-20260901-1215.xcresult` — 2 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro final Profile hierarchy/logout pair: `.artifacts/regression/ios17/profile-logout-regression-final-20260901-1215.xcresult` — 2 passed, 0 failed.
- Isolated confirmation runs retained for focused evidence: `.artifacts/regression/ios26/profile-logout-confirmation-final-20260901-1215.xcresult` and `.artifacts/regression/ios17/profile-logout-confirmation-final-20260901-1215.xcresult` — 1 passed, 0 failed on each OS.
- Fresh visually inspected system confirmations: `tmp/profile-logout-confirmation-final-20260901-1215-ios26-export/E415735C-8A03-4ACB-B97C-F564B9C1D508.png` and `tmp/profile-logout-confirmation-final-20260901-1215-ios17-export/4B16E6DF-BECC-4550-8A2A-6EBFFC8B7BF4.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. No sign-out, payment, invoice, transfer, issue creation, pet mutation, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### iOS 26 timing-regression hardening — 2026-09-01 11:45

The two simulator-contention failures seen in the 11:15 parallel suite were hardened without changing production UI behavior. Keyboard dismissal now uses one shared native-toolbar synchronization helper with enough time for the XCUI keyboard hierarchy to settle under load. The New Issue deadline menu retries once with a coordinate tap when iOS 26 acknowledges the semantic tap without presenting the menu, then waits for the menu item. The tests continue to stop before creating a donation invoice or posting the configured 500-sat issue.

Verification evidence:

- iOS 26.5 iPhone 17 Pro repeated run: `.artifacts/regression/ios26/timing-hardening-20260901-1145.xcresult` — 6 passed, 0 failed across three iterations of both affected tests.
- iOS 17.5 iPhone 15 Pro cross-version run: `.artifacts/regression/ios17/timing-hardening-20260901-1145.xcresult` — 2 passed, 0 failed.
- Fresh visually inspected Donate and New Issue renders: `tmp/timing-hardening-20260901-1145-export/03D431C0-9BC6-4D24-AB7E-A40368C90EB7.png` and `tmp/timing-hardening-20260901-1145-export/342C3704-445B-45D5-85BE-13CB40A2D940.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The accepted Profile composition was also re-inspected from its 11:15 fresh render. No invoice, payment, transfer, issue creation, pet mutation, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Cross-version regression after final Profile pet parity — 2026-09-01 11:15

The complete 25-test native suite was rerun after the Profile pet icon, route, and disconnected-color corrections. iOS 17.5 passed cleanly. The parallel iOS 26.5 run reported two unrelated automation timing misses: the New Issue deadline menu item was not exposed before its three-second assertion, and Donate's keyboard remained in the XCUI hierarchy for more than three seconds after dismissal. Both tests passed immediately when rerun sequentially on the same iOS 26.5 build, confirming simulator contention rather than a product regression. The terminal Profile flow also passed again in isolation and produced a clean top-of-page render.

Verification evidence:

- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/full-suite-profile-final-20260901-1115.xcresult` — 23 passed, 0 failed, 2 credential-dependent tests skipped.
- iOS 26.5 iPhone 17 Pro parallel suite: `.artifacts/regression/ios26/full-suite-profile-final-20260901-1115.xcresult` — 21 passed, 2 automation timing failures, 2 credential-dependent tests skipped.
- iOS 26.5 isolated timing rerun: `.artifacts/regression/ios26/full-suite-isolated-failures-20260901-1115.xcresult` — 2 passed, 0 failed.
- iOS 26.5 terminal Profile/QR/family-send/balance flow: `.artifacts/regression/ios26/profile-fresh-render-final-20260901-1115.xcresult` — 1 passed, 0 failed.
- Fresh Profile render: `tmp/profile-fresh-render-final-20260901-1115-export/DFA58D98-3A63-4167-B650-4EA56BE1BED1.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. No pet mutation, payment, invoice, transfer, issue creation, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile disconnected-pet color parity follow-up — 2026-09-01 10:45

Mobile web distinguishes pet connection state with both fill and foreground: connected pets use a white glyph on the active purple-to-blue gradient, while the disconnected cat uses a muted gray glyph on a gray circle. Native previously forced the disconnected cat white, making the inactive state look more prominent than its source. The pet icon now keeps connected glyphs white and applies the shared muted-text color only when no pet is connected.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-pet-color-parity-final-20260901-1045.xcresult` — 3 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/profile-pet-color-parity-final-20260901-1045.xcresult` — 3 passed, 0 failed.
- Fresh disconnected, populated, and squirrel Profile renders: `tmp/profile-pet-color-parity-final-20260901-1045-export/0E9E1AD8-CAFC-4F3B-829C-6AC81568D1BE.png`, `tmp/profile-pet-color-parity-final-20260901-1045-export/0C1DEA5C-4331-436A-ADB2-EBC6036806F7.png`, and `tmp/profile-pet-color-parity-final-20260901-1045-export/34B271F8-B784-462D-9E71-AF9486ED386E.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. No device pairing, pet mutation, payment, invoice, transfer, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile pet-icon semantic parity follow-up — 2026-09-01 10:15

Mobile web uses its cat glyph for the disconnected and unknown-pet states and has a dedicated squirrel glyph for squirrel devices. Native previously fell back to a generic pawprint and omitted the squirrel mapping. Profile now uses `cat.fill` for the same empty/unknown semantic state and a template-rendered Lucide squirrel asset for squirrel devices, while retaining type-specific native symbols where iOS provides an accurate equivalent. Stable icon identifiers keep the visual state covered without exposing it as a separate VoiceOver control.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-pet-icon-parity-final-20260901-1015.xcresult` — 3 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/profile-pet-icon-parity-final-20260901-1015.xcresult` — 3 passed, 0 failed.
- Fresh populated, disconnected, and squirrel Profile renders: `tmp/profile-pet-icon-parity-final-20260901-1015-export/EFADE546-7C03-4D51-B80B-789037DBAAD7.png`, `tmp/profile-pet-icon-parity-final-20260901-1015-export/206E0BF4-4074-435F-B491-0856F836A1FD.png`, and `tmp/profile-pet-icon-parity-final-20260901-1015-export/27C4FC5A-9E1F-4C01-BA1D-3A30170D3E55.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. No device pairing, pet mutation, payment, invoice, transfer, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile pet-action route parity follow-up — 2026-09-01 09:45

Mobile web sends the Profile pet metric to `/pet-settings` when a device is connected and to `/connect-pet` when it is not. Native previously opened the same general pet hub for both states. The Profile action now preserves the web routing model in an in-app Safari sheet while retaining native system chrome. The sheet lifecycle clears its SwiftUI item after dismissal, and its UIKit delegate is explicitly main-actor isolated for Swift 6 safety.

The pet handoffs are covered in a dedicated terminal UI test rather than interleaved with native Profile interactions. This isolates an iOS 26 XCUI limitation where `SFSafariViewController`'s Close control can remain in the automation hierarchy after a synthesized tap; the core Profile test therefore cannot be falsely failed by an external view-service dismissal while route selection and both handoffs remain verified independently.

Verification evidence:

- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/profile-pet-routing-isolated-final-20260901-0945.xcresult` — 3 passed, 0 failed.
- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-pet-routing-isolated-final-20260901-0945.xcresult` — 3 passed, 0 failed.
- Fresh populated Profile render: `tmp/profile-pet-routing-final-20260901-0945-export/38D236E1-D57F-4D5D-8086-F5F291F875F7.png`.
- Connected-settings and empty-connect handoff renders: `tmp/profile-pet-routing-final-20260901-0945-export/4DAB2DEB-D3DA-4239-9667-A2D894DC82CC.png` and `tmp/profile-pet-routing-final-20260901-0945-export/BBD5C139-0486-4914-932B-437C3ECF4524.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, `ref_05_tesla_energy_mobile.png`, and the mobile-web Profile implementation. No device pairing, pet mutation, payment, invoice, transfer, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile fiat-value resilience follow-up — 2026-09-01 08:45

Mobile web keeps the rounded USD context beside the sats balance even before a fresh Bitcoin quote is available, using its documented $100,000 fallback. Native previously returned an empty string until the quote request completed, leaving a visible hierarchy gap in offline, slow-network, and deterministic preview states. Profile now renders the same resilient fallback immediately and replaces it with the live rounded value when available. The regression fixture uses a deterministic $80,000 quote, producing the mobile-web baseline `$22` for 27,900 sats without depending on an external price response.

Verification evidence:

- iOS 26.5 iPhone 17 Pro and iOS 17.5 iPhone 15 Pro Profile/populated and empty-relationship flows: `.artifacts/regression/profile-usd-parity-final-20260901-0845.xcresult` — 2 passed, 0 failed on each OS.
- Visually inspected populated renders: `tmp/profile-usd-parity-final-20260901-0845-export/FF54728F-E134-47F0-821D-873DB9E18030.png` (iOS 26.5) and `tmp/profile-usd-parity-final-20260901-0845-export/A9751D26-6659-4C7E-BC63-FD930E5D4303.png` (iOS 17.5).
- Visually inspected iOS 26.5 empty-relationship render: `tmp/profile-usd-parity-final-20260901-0845-export/ADB0B9D6-C99A-4092-914B-1F27EB749D54.png`.
- Compared with `ref_02_transaction_ui.png`, `ref_03_tesla_vehicle_ui.png`, `ref_05_tesla_energy_mobile.png`, and the captured mobile-web Profile baseline. No payment, invoice, transfer, protected pet/family action, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile balance-format content follow-up — 2026-09-01

The native Profile family grid used the general one-decimal balance formatter, so fixture balances such as `60,600` rendered as `60.6k`. Mobile web uses a dedicated family formatter that floors thousands and renders the same value as `60k`. Native now preserves that exact content model for every family tile while retaining mobile web's one-decimal rule for the primary Profile balance below 100,000 sats and whole-thousands rule at or above 100,000 sats.

Verification evidence:

- iOS 26.5 Profile/QR/balance/family-send regression: `.artifacts/regression/ios26/profile-family-balance-parity-20260901-0545.xcresult`
- iOS 17.5 Profile/QR/balance/family-send regression: `.artifacts/regression/ios17/profile-family-balance-parity-20260901-0545.xcresult`
- Visually inspected Profile render: `tmp/profile-family-balance-20260901-0545-export/D0DBD6E2-B384-435E-A166-3782AAE44168.png`
- The deterministic regression asserts `60k` is present and the previous `60.6k` rendering is absent; it does not initiate a transfer, invoice, or other production mutation.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile family-grid spacing follow-up — 2026-09-01

The native family card had preserved the web content and four-column structure but compressed each grid item by dropping the web tile padding and reducing its internal rhythm. The corrected render restores the mobile-web two-row card depth while retaining the adaptive two-column accessibility layout as a justified native divergence. Names now also scale down slightly before truncation.

Verification evidence:

- iOS 26.5 normal Profile hierarchy and QR interaction: `.artifacts/regression/ios26/profile-spacing-20260901-0415.xcresult`
- iOS 26.5 accessibility XXXL: `.artifacts/regression/ios26/profile-spacing-accessibility-20260901-0415.xcresult`
- iOS 17.5 normal Profile hierarchy, QR interaction, and accessibility XXXL: `.artifacts/regression/ios17/profile-spacing-20260901-0415.xcresult`
- iOS 26.5 deterministic Groups, Activity/deep-link, and Posts-filter destinations: `.artifacts/regression/ios26/profile-destinations-after-spacing-20260901-0415.xcresult`
- Visually inspected normal render: `tmp/profile-spacing-20260901-0415-export/7D29743E-49A1-4674-BC70-E2F0C578C83A.png`

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile balance interaction follow-up — 2026-09-01

The Profile balance presentation already matched the mobile web hierarchy, but it had lost the web interaction that opens the wallet. The balance is now a plain native navigation link into `WalletView`, preserving the source interaction without adding visual chrome or changing the accepted composition.

Verification evidence:

- iOS 26.5 Profile/QR/balance-to-wallet regression: `.artifacts/regression/ios26/profile-balance-parity-fixed-20260901-0445.xcresult`
- iOS 17.5 Profile/QR/balance-to-wallet regression: `.artifacts/regression/ios17/profile-balance-parity-20260901-0445.xcresult`
- Visually inspected Profile render: `tmp/profile-balance-parity-20260901-0445-export/DEDFDE75-B850-4528-BBBA-857796ADD107.png`
- Visually inspected native Wallet destination: `tmp/profile-balance-parity-20260901-0445-export/63136F9E-9D78-4245-8637-25C67F73A376.png`

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Home mobile-web parity review — 2026-09-01

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 4/5 |
| **Total** | **45/50 — pass** |

### Profile family-send interaction follow-up — 2026-09-01

Mobile web sends a family-tile tap directly to the wallet withdrawal flow. Native iOS had inserted a member-detail screen, adding a step and changing the interaction model. Family tiles now present the native Send sheet directly with the selected username prefilled; Family Accounts remains the dedicated management surface. Visual inspection also caught and corrected the shared payment button style so disabled actions no longer appear fully active.

Verification evidence:

- iOS 26.5 Profile/QR/balance/family-send regression: `.artifacts/regression/ios26/profile-family-send-parity-final-20260901-0515.xcresult`
- iOS 17.5 Profile/QR/balance/family-send regression: `.artifacts/regression/ios17/profile-family-send-parity-final-20260901-0515.xcresult`
- iOS 26.5 accessibility XXXL regression: `.artifacts/regression/ios26/profile-family-send-accessibility-20260901-0515.xcresult`
- iOS 17.5 accessibility XXXL regression: `.artifacts/regression/ios17/profile-family-send-accessibility-20260901-0515.xcresult`
- Visually inspected Profile render: `tmp/profile-family-send-final-20260901-0515-export/9CDACDF2-3A3E-4F03-A19F-86E2FD18EF35.png`
- Visually inspected prefilled native Send sheet: `tmp/profile-family-send-final-20260901-0515-export/99E79776-64EF-4429-8F19-C332507027E7.png`

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile pet-state content follow-up — 2026-09-01

Mobile web renders the connected pet's actual name and type in the Profile metrics card, falling back to `Connect Pet` when no device is connected. Native iOS had hard-coded `Satoshi pet`, so the same user state could present different content across platforms. Profile overview now reads the newest connected device without making the rest of Profile loading depend on that optional query. The native row preserves the web content and purple-to-blue connected-state treatment while using type-appropriate SF Symbols as a justified native control detail.

Verification evidence:

- iOS 26.5 Profile/QR/balance/family-send/pet regression: `.artifacts/regression/ios26/profile-pet-parity-20260901-0615.xcresult`
- iOS 17.5 Profile/QR/balance/family-send/pet regression: `.artifacts/regression/ios17/profile-pet-parity-20260901-0615.xcresult`
- iOS 26.5 accessibility XXXL regression: `.artifacts/regression/ios26/profile-pet-accessibility-20260901-0615.xcresult`
- iOS 17.5 accessibility XXXL regression: `.artifacts/regression/ios17/profile-pet-accessibility-20260901-0615.xcresult`
- Visually inspected Profile render: `tmp/profile-pet-parity-20260901-0615-export/2E2A85C0-EE7A-4516-8151-3DE4603371BD.png`
- The deterministic fixture asserts connected pet name `pup`, its native `Open pup` action, and the absence of the previous hard-coded `Satoshi pet` content. No protected pet action, payment, invoice, transfer, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile root-chrome spacing follow-up — 2026-09-01

Mobile web starts directly with the identity surface and has no Profile page title. Native had relied on an empty navigation title to suppress root chrome. Profile now encodes that requirement explicitly while every pushed destination explicitly restores its native navigation bar, preventing an OS-specific empty header from appearing without sacrificing the superior iOS back control. Fresh renders confirm the accepted card position and spacing remain stable.

Verification evidence:

- iOS 17.5 and iOS 26.5 normal Profile, QR, family-send, balance-to-Wallet, and accessibility regressions: `.artifacts/regression/profile-root-chrome-final-20260901-0645.xcresult`
- Additional iOS 26.5 iPhone 17 regression for the same root-chrome and interaction flow: `.artifacts/regression/ios26/profile-root-chrome-iphone17-20260901-0645.xcresult`
- Visually inspected iOS 26.5 Profile render: `tmp/profile-root-chrome-final-20260901-0645-export/DF7A714E-2AF7-432C-A5D2-D43F91392DF0.png`
- Visually inspected restored native Wallet destination chrome: `tmp/profile-root-chrome-final-20260901-0645-export/71C43F8C-A056-4A96-AF67-F19A4D4B361A.png`
- Visually inspected iPhone 17 Profile render: `tmp/profile-root-chrome-iphone17-20260901-0645-export/04FC1D47-606F-40BB-A7BF-878B3A0C9A0A.png`
- No invoice, transfer, payment, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Cross-version full regression after Profile parity — 2026-09-01 07:15

The accepted native Profile composition was re-rendered and visually inspected after the mobile-web hierarchy, family interactions, balance formatting, connected-pet state, and root-chrome corrections. The current render retains the web source's card-first identity and metrics hierarchy, four-column family grid, restrained border treatment, content order, and unboxed menu rows. The system tab bar and pushed-screen navigation bars remain justified native controls.

Full verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/full-suite-profile-parity-20260901-0715.xcresult` — 20 passed, 0 failed, 2 credential-dependent authenticated tests skipped.
- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/full-suite-profile-parity-20260901-0715.xcresult` — 20 passed, 0 failed, 2 credential-dependent authenticated tests skipped.
- Fresh visually inspected iOS 26.5 Profile render: `tmp/full-suite-profile-parity-20260901-0715-export/7FA7E50A-D828-496B-B1BC-61B9DAC6EEBF.png`.
- The suites cover four model/configuration tests and the complete deterministic UI suite. No invoice, transfer, payment, issue mutation, authentication submission, or production mutation was executed; reward-bearing fixtures remain capped at 500 sats.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile empty-relationship state follow-up — 2026-09-01 07:45

The accepted Profile composition now has deterministic coverage for the mobile web fallback when the account has neither family members nor a connected pet. The empty native state retains the same identity/metrics hierarchy, renders `Connect Pet`, keeps the Family surface available with only the `Add` action, and does not synthesize a recipient action or stale pet content.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-empty-relationships-20260901-0745.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro: `.artifacts/regression/ios17/profile-empty-relationships-20260901-0745.xcresult` — 1 passed, 0 failed.
- Fresh visually inspected iOS 26.5 render: `tmp/profile-empty-relationships-20260901-0745-export/1671AAC0-F9B4-46E8-B989-BD70DB16FCC8.png`.
- No protected pet action, family transfer, invoice, payment, authentication submission, or production mutation was executed.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile empty-action destination follow-up — 2026-09-01 08:15

The deterministic empty-relationship Profile regression now verifies the complete safe interaction path rather than only the fallback labels. `Connect Pet` opens the native Satoshi pet hub, and the Add tile opens the native Family accounts destination with its empty state and protected web-backed add action intact. Accessibility identifiers now live on the individual interactive controls and identity text instead of the containing identity card, avoiding inherited identifiers and preserving distinct VoiceOver controls across iOS 17.5 and 26.5.

Verification evidence:

- iOS 26.5 iPhone 17 Pro empty-action flow: `.artifacts/regression/ios26/profile-empty-destinations-final-20260901-0815.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone 15 Pro empty-action flow: `.artifacts/regression/ios17/profile-empty-destinations-final-20260901-0815.xcresult` — 1 passed, 0 failed.
- Normal Profile and accessibility XXXL follow-up: `.artifacts/regression/ios26/profile-identifier-regressions-20260901-0815.xcresult` and `.artifacts/regression/ios17/profile-identifier-regressions-20260901-0815.xcresult` — 2 passed, 0 failed on each OS.
- Visually inspected iOS 26.5 renders: `tmp/profile-empty-destinations-final-20260901-0815-export/AF937C03-F91E-41C7-8C85-78360477BE50.png`, `tmp/profile-empty-destinations-final-20260901-0815-export/1F49D4DF-3DAD-41EB-91D0-49D8AEF83661.png`, and `tmp/profile-empty-destinations-final-20260901-0815-export/8A9D8C54-EB37-429D-A649-5C19F9427B31.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. No protected web action, device pairing, family mutation, payment, invoice, transfer, or production mutation was initiated.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Compact Profile navigation-tap hardening — 2026-09-01 22:45

The pending compact iOS 17.5 Profile-suite rerun exposed two simulator-only synthesized-tap misses: the populated Groups row and the empty Profile Add-family action remained visible and hittable without delivering their navigation actions. Both safe navigation controls now use the shared bounded tap helper, which makes one semantic attempt and up to two center-coordinate retries before failing. No production UI or application behavior changed.

Verification evidence:

- Initial compact iOS 17.5 diagnostic suite: `.artifacts/regression/ios17/profile-suite-compact-after-account-id-hardening-20260901-2245.xcresult` — the two navigation-tap misses reproduced while the account-ID QR flow passed.
- Isolated compact iOS 17.5 verification after hardening: `.artifacts/regression/ios17/profile-compact-navigation-tap-hardening-20260901-2254.xcresult` — 2 passed, 0 failed.
- Complete compact iOS 17.5 Profile suite after hardening: `.artifacts/regression/ios17/profile-suite-compact-after-navigation-hardening-20260901-2257.xcresult` — 12 passed, 0 failed, 1 credential-dependent authenticated test skipped.
- Targeted iOS 26.5 verification of both hardened navigation flows: `.artifacts/regression/ios26/profile-navigation-tap-hardening-20260901-2303.xcresult` — 2 passed, 0 failed.
- Fresh exported evidence: `tmp/profile-suite-compact-after-navigation-hardening-20260901-2257-export/9371D491-88B9-483A-8D38-5E813EDCD03A.png`, `tmp/profile-suite-compact-after-navigation-hardening-20260901-2257-export/AF728FDD-4FC7-47C2-95B9-937F3ED0AF78.png`, and `tmp/profile-suite-compact-after-navigation-hardening-20260901-2257-export/057A6D18-9D89-4FC7-A0FB-DF98B31DAF7F.png` were visually inspected against `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`.
- No group, family, pet, payment, invoice, transfer, authentication, or production mutation was executed.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Family removal accessibility follow-up — 2026-09-02 01:15

The newly differentiated child-account and quick-contact removal flow was exercised at accessibility XXXL on both supported simulator generations. Initial visual inspection found the fixed-height destructive action truncating `Delete child account`; the production buttons now grow vertically and wrap to two lines while preserving the native confirmation presentation and semantic destructive color. The full destructive label, warning, and confirmation remain reachable without invoking either mutation.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/family-removal-accessibility-fixed-20260902-0115.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE: `.artifacts/regression/ios17/family-removal-accessibility-fixed-20260902-0115.xcresult` — 1 passed, 0 failed.
- Fresh inspected renders: `tmp/family-removal-accessibility-fixed-ios26-export/7F08C7E7-4799-427B-867A-AE0F4039E8E3.png`, `tmp/family-removal-accessibility-fixed-ios26-export/6D544ECB-EE54-45F6-91C7-9DD2C76A09B8.png`, `tmp/family-removal-accessibility-fixed-ios17-export/C7222534-78D8-4D25-AF46-1F33A29D926B.png`, and `tmp/family-removal-accessibility-fixed-ios17-export/AC62ED26-283D-4531-A6E9-D116B2F8208E.png`.
- Compared with `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png` after reviewing `/Users/claw/DESIGN_SYSTEM.md`.
- No deletion, family mutation, payment, transfer, invoice, authentication submission, or production action was executed.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Unnamed child-account management fallback — 2026-09-02 01:45

The Profile root already matched mobile web by labeling an unnamed connected child `Child`, but the deeper native Family accounts destination still treated an empty string as a real display name. That could leave the management row and navigation title blank and produce malformed destructive copy such as `Delete ?`. Family account presentation now trims API names before use, preserves mobile web's `Child` fallback for unnamed child accounts, retains `@username` on the detail screen and in the native Send path, and uses `Delete this child account?` when no usable name exists. Quick contacts continue to fall back to their username because they are not switchable child accounts.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/family-unnamed-fallback-20260902-0145.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/family-unnamed-fallback-20260902-0145.xcresult` — 1 passed, 0 failed.
- Fresh current-device list and confirmation renders: `tmp/family-unnamed-fallback-ios26-export/7F253F07-C59A-4C4D-816C-0BB83938C906.png` and `tmp/family-unnamed-fallback-ios26-export/D7F725B9-65D3-43B2-A052-3ECDB22B5EE7.png`.
- Fresh compact list and confirmation renders: `tmp/family-unnamed-fallback-ios17-export/20208F4A-8468-4047-9463-F7191C616B06.png` and `tmp/family-unnamed-fallback-ios17-export/E57CB457-14C8-41F5-A660-70FCA8EDDC18.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png` before implementation. Final inspection found the established near-black canvas, one semantic green primary action, restrained technical metadata, clear list/detail hierarchy, and native semantic-red confirmation intact on both device classes.
- The regression stops at the confirmation UI. No child account deletion, family mutation, transfer, payment, invoice, production mutation, or sats spend occurred.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Cross-version Family deeper-state regression closure — 2026-09-02 03:15

The complete deterministic Family destination suite was rerun after adding child and quick-contact Send-prefill coverage. A source comparison confirmed that mobile web family tiles also route to Send; account switching belongs to the global balance menu rather than the Profile or Family surface, so no scope-expanding native session rewrite was introduced. The native Family list/detail hierarchy, relationship-specific removal semantics, cancelable confirmations, accessibility XXXL layout, unnamed-child fallbacks, and prefilled Send state now pass together on both supported simulator generations.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/family-suite-after-send-prefill-20260902-0315.xcresult` — 6 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/family-suite-after-send-prefill-20260902-0315.xcresult` — 6 passed, 0 failed.
- Fresh inspected iOS 26.5 renders: `tmp/family-suite-after-send-prefill-ios26-export/0C16DF90-37CC-496F-BF8B-4F2F378B9229.png`, `tmp/family-suite-after-send-prefill-ios26-export/06AB4C75-B035-4FB5-8567-053D5461C00F.png`, and `tmp/family-suite-after-send-prefill-ios26-export/7225C7CF-053E-45F5-AD52-4A72BE9DE403.png`.
- Fresh inspected compact iOS 17.5 renders: `tmp/family-suite-after-send-prefill-ios17-export/AC12DEB7-FEBA-4F51-8040-0B8D98984778.png`, `tmp/family-suite-after-send-prefill-ios17-export/ABBC4F76-5020-4703-80E6-4AFB17546143.png`, and `tmp/family-suite-after-send-prefill-ios17-export/B98949FE-DE97-4213-839E-294046714055.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The final renders preserve the near-black canvas, deliberate card spacing, one semantic green primary action, muted metadata, and semantic red reserved for destructive state.
- The tests stop before payment review and before confirming either destructive action. No family mutation, child-account deletion, transfer, invoice, authentication submission, production mutation, or sats spend occurred.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Profile name account-switcher parity — 2026-09-02 04:15

The native Profile identity now preserves the mobile web Profile page's account-switching interaction instead of limiting selection to Home's global balance menu. When owner-connected child accounts are available, the existing first-name focal point gains a quiet native chevron and opens a system account picker with the selected account marked. Selecting a child updates the visible name, username, balance, USD estimate, and fixes immediately; returning to the owner restores the owner state. Profile's authenticated deeper data load is now keyed to the active user ID rather than the unchanged bearer token, so posts and pet state refresh after a real account switch. Add/remove management remains in the established native Family accounts destination, where relationship-specific semantics and confirmations are already covered.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-name-account-switcher-owner-label-20260902-0415.xcresult` — 1 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/profile-name-account-switcher-owner-label-20260902-0415.xcresult` — 1 passed, 0 failed.
- Fresh inspected current-device owner menu and selected-child renders: `tmp/profile-name-account-switcher-owner-label-ios26-export-final/998313DD-0403-4C5E-9E20-27683CF76247.png` and `tmp/profile-name-account-switcher-owner-label-ios26-export-final/1B69866D-1AB9-410C-A371-06C9F9062793.png`.
- Fresh inspected compact owner menu and selected-child renders: `tmp/profile-name-account-switcher-owner-label-ios17-export/1283DC55-6515-4C84-B43A-17C4B334E0FE.png` and `tmp/profile-name-account-switcher-owner-label-ios17-export/A3BBE12C-3E1E-4282-A1DC-6A9CED104482.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The existing near-black cards, 24-point identity typography, four-column Family geometry, muted chrome, and single green QR accent remain unchanged. The native picker is readable without clipping on both device classes and disappears entirely when no account choice exists.
- The deterministic regression changes only in-memory session selection. No account relationship, profile row, family record, wallet action, payment, invoice, production mutation, or sats balance was changed.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Cross-version Profile suite after account switching — 2026-09-02 04:55

The complete deterministic Profile parity suite was rerun after the name-level account picker landed. The integrated run covers the mobile-web root hierarchy, owner/child switching, balance and identity refresh, native wallet and family Send handoffs, QR display/copy/edit states, avatar editing, logout cancellation, empty relationships, connected and unnamed pets, unnamed family fallback, admin gating, populated deeper destinations, post filtering, and accessibility XXXL. Both supported simulator generations pass together, so the isolated picker result is not masking a regression elsewhere in Profile.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/profile-suite-after-name-switcher-20260902-0442.xcresult` — 15 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/profile-suite-after-name-switcher-20260902-0442.xcresult` — 15 passed, 0 failed.
- Full command logs: `.artifacts/regression/ios26/profile-suite-after-name-switcher-20260902-0442.log` and `.artifacts/regression/ios17/profile-suite-after-name-switcher-20260902-0442.log`.
- Fresh current-device renders were exported to `tmp/profile-suite-after-name-switcher-ios26-export/`; the manifest maps semantic attachment names to files. The Profile root, owner picker, selected-child state, QR states, accessibility layout, and deeper destinations were visually inspected.
- The older `.artifacts/regression/ios26/profile-name-account-switcher-final2-20260902-0415.xcresult` failure finished before the 04:36 accessibility-label correction. The later isolated owner-label results and both complete suites above supersede it; sibling `profile-name-account-switcher-final*.xcresult` bundles with zero tests are non-evidence.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. The final output retains the near-black canvas, deliberate card spacing, muted metadata, thin separators, one semantic green QR accent, and source-faithful four-column Family geometry. The system account picker is the sole justified native control divergence and does not introduce decorative chrome.
- Tests stopped before payment review and cancelled every destructive confirmation. No relationship, profile, wallet, group, post, authentication, production, or sats mutation occurred.

| Criterion | Score |
|---|---:|
| Restraint | 5/5 |
| Visual hierarchy | 5/5 |
| Negative space | 4/5 |
| Typography | 4/5 |
| Alignment / precision | 5/5 |
| Visualization quality | 4/5 |
| Color discipline | 5/5 |
| Premium / engineered feel | 4/5 |
| Immediate comprehension | 5/5 |
| Match to reference grammar | 5/5 |
| **Total** | **46/50 — pass** |

### Family navigation tap-regression hardening — 2026-09-02 05:15

The shared owner/child regression pass after Profile account switching exposed two test-only synthesized-tap gaps in older Family coverage. The populated Family test targeted the visible `Marlowe` text instead of the row's stable button identifier, and the unnamed-child flow made only one semantic attempt to open its native deletion confirmation. Newer identifier-based Family tests passed in the same run, confirming that production navigation and confirmation behavior were intact. Both older paths now use the existing bounded semantic-then-center tap helper and require their destination before asserting deeper state.

Verification evidence:

- Initial iOS 26.5 diagnostic suite: `.artifacts/regression/ios26/shared-account-family-suite-20260902-0515.xcresult` — 6 passed, 2 test-interaction failures. The Home and Profile account switchers, Send prefill, relationship-specific removal, cancellation, and accessibility flows all passed; the retained bundle documents the isolated tap misses.
- Final integrated iOS 26.5 shared account/Family suite: `.artifacts/regression/ios26/shared-account-family-suite-fixed-20260902-0515.xcresult` — 8 passed, 0 failed.
- iOS 26.5 iPhone 17 Pro repaired Family paths: `.artifacts/regression/ios26/family-navigation-tap-hardening-20260902-0515.xcresult` — 2 passed, 0 failed.
- iOS 17.5 iPhone SE (3rd generation) repaired Family paths: `.artifacts/regression/ios17/family-navigation-tap-hardening-20260902-0515.xcresult` — 2 passed, 0 failed.
- Fresh inspected iOS 26.5 list, detail, and confirmation renders: `tmp/family-navigation-tap-hardening-20260902-0515-ios26-export/F29A5316-D20C-49F9-AEF2-98FBF238511C.png`, `tmp/family-navigation-tap-hardening-20260902-0515-ios26-export/10716D17-7337-42EE-8A08-B6A928F79D2F.png`, and `tmp/family-navigation-tap-hardening-20260902-0515-ios26-export/321C78F5-9B8C-4885-8DF6-A747D1CE38BD.png`.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. No production visual implementation changed; the fresh renders preserve the accepted near-black surfaces, clear hierarchy, restrained green primary action, muted metadata, and semantic red reserved for removal.
- The regressions stop before Send review and before confirming removal. No family relationship, child account, payment, invoice, transfer, production record, or sats balance was mutated.

Design Constitution Review remains **46/50 — pass**; this slice changed test interaction only.

### Full-suite Family accessibility tap-regression hardening — 2026-09-02 05:45

The first complete iOS 26.5 regression after account switching passed every deterministic unit and UI path except the accessibility-size child-removal confirmation. The destructive action remained visible, hittable, taller than 48 points, and on-screen, but one semantic XCUI tap did not present the native confirmation before the three-second assertion. The same flow had passed in earlier isolated coverage, identifying a simulator interaction miss rather than a production layout regression. The test now uses the shared bounded semantic-then-center tap helper already proven by the other Family confirmation paths; production UI and application behavior are unchanged.

Verification evidence:

- Initial iOS 26.5 full suite: `.artifacts/regression/ios26/full-suite-after-account-switching-20260902-0545.xcresult` — 38 passed, 1 test-interaction failure, and 2 credential-dependent authenticated tests skipped. All 40 other results completed successfully; the retained bundle documents the isolated missed confirmation tap.
- Repaired accessibility flow on iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/family-removal-accessibility-tap-hardening-20260902-0545.xcresult` — 1 passed, 0 failed.
- Repaired accessibility flow on iOS 17.5 iPhone SE (3rd generation): `.artifacts/regression/ios17/family-removal-accessibility-tap-hardening-20260902-0545.xcresult` — 1 passed, 0 failed.
- Final integrated iOS 26.5 Family suite: `.artifacts/regression/ios26/family-suite-after-accessibility-tap-hardening-20260902-0545.xcresult` — 6 passed, 0 failed.
- Full command logs sit beside each result bundle. The fixed test stops at the native confirmation; no child deletion, family mutation, payment, invoice, transfer, production mutation, or sats spend occurred.

Design Constitution Review remains **46/50 — pass**; this slice changed test interaction only.

### Full-suite order-dependent tap follow-up — 2026-09-02 06:15

The complete iOS 26.5 rerun confirmed that the accessibility-size child-removal path fixed at 05:45 now passes in full-suite order. It also exposed two additional test-only delivery gaps after long serial execution: selecting `Marlowe` from the native Profile account menu could dismiss the menu without changing the fixture account, and the owner review test could address the underlying `Approve` button before the rejected-fix sheet had fully disappeared. Production state and UI were intact in the captured accessibility hierarchy. Account selection now retries by reopening the picker until the destination balance exists, while the owner flow waits for sheet dismissal and button hittability; the Mark Complete entry uses the same bounded destination helper as other navigation actions.

Verification evidence:

- Complete iOS 26.5 diagnostic rerun: `.artifacts/regression/ios26/full-suite-after-accessibility-tap-hardening-20260902-0615.xcresult` — 37 passed, 2 test-interaction failures, and 2 credential-dependent authenticated tests skipped. The previously failing accessibility removal path passed in this integrated run.
- iOS 26.5 Profile account-switching repair: `.artifacts/regression/ios26/full-suite-two-order-dependent-tap-hardening-20260902-0615.xcresult` — the Profile test passed; the same two-test bundle retained the independently diagnosed owner-sheet timing failure.
- Final iOS 26.5 owner confirmation repair: `.artifacts/regression/ios26/owner-confirmation-tap-hardening-20260902-0615.xcresult` — 1 passed, 0 failed.
- Cross-version iOS 17.5 repair verification: `.artifacts/regression/ios17/order-dependent-tap-hardening-20260902-0615.xcresult` — 2 passed, 0 failed.
- Full command logs sit beside each result bundle. Tests changed only deterministic fixture state and stopped at confirmation UI; no reward, issue, family, profile, wallet, payment, production record, or sats balance was mutated.

Design Constitution Review remains **46/50 — pass**; this follow-up changed test interaction only and introduced no production visual changes.

### Complete regression closure after order-dependent tap hardening — 2026-09-02 06:45

The complete iOS 26.5 suite was rerun after the Profile account-selection and owner-confirmation XCUI hardening from the preceding slice. Both formerly failing tests passed in their original serial-suite positions, along with the previously repaired accessibility-size Family removal flow. This closes the known deterministic regression set without introducing any production UI or behavior change.

Verification evidence:

- iOS 26.5 iPhone 17 Pro: `.artifacts/regression/ios26/full-suite-after-order-dependent-hardening-20260902-0645.xcresult` — 39 passed, 0 failed, 2 credential-dependent authenticated tests skipped (41 total).
- Full command log: `.artifacts/regression/ios26/full-suite-after-order-dependent-hardening-20260902-0645.log`.
- `xcrun xcresulttool get test-results summary` reports `result: Passed`, 0 expected failures, and no test failures.
- The integrated run specifically passed `testProfileNameMenuSwitchesConnectedAccountsLikeMobileWeb`, `testOwnerReviewAndCloseConfirmationsAreSafe`, and `testFamilyRemovalAdaptsAtAccessibilityTextSize` in full-suite order.
- The two skips are the existing live-session/credential-gated authenticated navigation checks; deterministic Profile and deeper-destination fixture coverage passed.
- Tests changed only local fixture state, stopped before wallet/payment and destructive confirmations, and performed no relationship, profile, reward, wallet, group, post, authentication, production, or sats mutation.

Design Constitution Review remains **46/50 — pass**; this closure run changed no production visual implementation.

### Compact full-suite location-permission isolation — 2026-09-02 07:15

The first complete iOS 17.5 regression run after the cross-version Profile and Family closure passed every deterministic path except the New Issue location-denial recovery. The permission sheet arrived more than one second after the app-side request, so the test stopped waiting before it could tap `Don’t Allow`; the still-queued sheet was then handled by the following owner-review test. The regression now allows five bounded seconds for the system sheet. This gives Core Location time to deliver its denial callback and prevents the permission UI from leaking into the next test. Production UI and application behavior are unchanged.

Verification evidence:

- Initial iOS 17.5 iPhone SE (3rd generation) full suite: `.artifacts/regression/ios17/full-suite-after-order-dependent-hardening-20260902-0715.xcresult` — 38 passed, 1 test-interaction failure, and 2 credential-dependent authenticated tests skipped (41 total). All Profile and Family tests passed in suite order.
- Repaired location-denial path on iOS 17.5: `.artifacts/regression/ios17/location-denial-permission-sheet-wait-20260902-0715.xcresult` — 1 passed, 0 failed.
- Repaired location-denial path on iOS 26.5: `.artifacts/regression/ios26/location-denial-permission-sheet-wait-20260902-0715.xcresult` — 1 passed, 0 failed.
- Fresh-permission-state iOS 17.5 paired regression: `.artifacts/regression/ios17/location-denial-and-owner-followup-20260902-0715.xcresult` — 2 passed, 0 failed. Simulator location privacy was reset before the run; denial recovery passed first and the following owner confirmation test opened without a leaked system alert.
- Fresh inspected compact recovery render: `tmp/location-denial-and-owner-followup-ios17-export/82E9EB79-FD5F-40D8-A7D3-17D395447850.png`. The manual location field remains available and the explicit red recovery message is visible without obscuring the reward controls.
- Reviewed `/Users/claw/DESIGN_SYSTEM.md` and inspected `ref_01_bitcoin_edges.png`, `ref_02_transaction_ui.png`, and `ref_05_tesla_energy_mobile.png`. No production visual implementation changed; the inspected recovery state retains the black canvas, deliberate spacing, muted input surfaces, restrained green affordance, and semantic red reserved for the actionable error.
- The regressions did not submit an issue or confirm a reward. No post, wallet, family, profile, payment, invoice, production record, or sats balance was mutated.

Design Constitution Review remains **46/50 — pass**; this slice changed test timing only.
