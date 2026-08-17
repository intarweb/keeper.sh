# Keeper.sh Mobile

First-party iOS, Android, and development-web client for Keeper.sh. The app is an
Expo SDK 57 / Expo Router application and remains a client of the existing Keeper
API: provider credentials, sync state, event reconciliation, and queues stay on the
server.

## Feature coverage

- Better Auth Expo session storage, hosted/self-hosted profiles, email or username
  credentials, social sign-in, verification/reset callbacks, logout, and deletion.
- Native Today agenda, event activity, invitations/RSVP, realtime sync state, manual
  sync, pause/resume, and account recovery.
- Google, Outlook, Microsoft 365, iCloud, Fastmail, generic CalDAV, and remote iCal
  connections; account setup, mappings, calendar privacy, sync ranges, and iCal
  inclusion.
- Event detail/create/update/delete, native share and clipboard actions, and
  provider links.
- Plan entitlements/management, password and biometric local lock, API tokens, iCal
  feed privacy, push preferences/device registration, analytics consent, feedback,
  reports, about/legal, and server switching.
- Profile-isolated SQLite read cache with offline/stale presentation, deep-link and
  notification routing, EAS Observe, and EAS development/production build profiles.

## Configure

Copy `.env.example` to `.env` and set the EAS project fields before testing remote
push notifications or production associated links. Hosted mode defaults to
`https://keeper.sh`; local development may select an HTTP localhost or `.local`
server from the sign-in screen.

The backend must include the Better Auth Expo plugin, the allowlisted `keeper://`
origin, mobile OAuth return-ticket support, and `/api/mobile/*` routes included in
this worktree.

For verified production links, configure the web service with
`MOBILE_IOS_TEAM_ID` and `MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`. The bundle and
package variables default to `sh.keeper.mobile`; override them with
`MOBILE_IOS_BUNDLE_ID` and `MOBILE_ANDROID_PACKAGE_NAME` when the signed app uses
different identifiers. The `/.well-known/apple-app-site-association` and
`/.well-known/assetlinks.json` endpoints intentionally return `503` until their
platform signing values are configured.

## Develop and verify

From the repository root:

```sh
bun install
bun run --cwd applications/mobile dev
bun run --cwd applications/mobile types
bun run --cwd applications/mobile test
cd applications/mobile && npx expo-doctor
```

Use the development client for local work. Native passkeys add an autolinked Expo
module that is not bundled in Expo Go; remote push and verified universal/app
links likewise require the signed development client:

```sh
bun run --cwd applications/mobile dev -- --dev-client
cd applications/mobile && eas build --profile development --platform ios
cd applications/mobile && eas build --profile development --platform android
```

No secrets belong in `EXPO_PUBLIC_*` values. The selected server URL is public
configuration; Better Auth cookies remain in SecureStore.

## Release gates

- Social/provider OAuth, remote push, biometrics, associated links, and passkeys need
  physical iOS and Android device validation.
- Passkey sign-in and management use the platform credential APIs in development
  and release builds. The canonical RP domain must serve its association document
  directly before either platform will authorize a credential ceremony.
- Plan management opens the server-owned HTTPS URL. The app does not embed Polar or
  claim an App Store / Play billing flow; storefront-policy approval remains a
  release gate.
- Offline mode is read-only. Mutations fail visibly when unavailable and are never
  silently queued.
- Push content is expected to contain opaque resource IDs and internal paths only.
