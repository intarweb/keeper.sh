# Keeper.sh Expo application plan

Status: full application implemented; integrated verification and physical-device release gates remain

Worktree: `/Users/rida/keeper.sh-expo-mobile`

Branch: `codex/expo-mobile`

Baseline: `origin/main` at `b5529d2c`

## Outcome

Build a first-party iOS and Android application with full parity for Keeper.sh's
authenticated web product, then expose the existing API-only calendar capabilities
that are especially useful on mobile. The app remains a client of Keeper.sh: account
credentials, provider refresh tokens, calendar ingestion, reconciliation, queues, and
the sync engine stay on the server.

The initial release should feel like Keeper.sh translated into native platform
conventions, not a web view. It keeps the compact hierarchy, provider identity,
neutral semantic palette, Geist typography, restrained motion, privacy posture, and
clear sync status of `applications/web/src/index.css` and
`applications/web/src/routes/(dashboard)/dashboard/index.tsx`.

## Scope decisions

### Required authenticated parity

- Hosted and self-hosted sign-in modes, registration, verification, password reset,
  social sign-in where enabled, logout, and capability-driven UI.
- Dashboard sync state, event activity, accounts, calendars, agenda, and iCal feed.
- Google, Outlook, Microsoft 365, iCloud, Fastmail, generic CalDAV, and remote ICS
  connection flows.
- Calendar selection, inline rename, source/destination mapping setup, plan limits,
  advanced privacy controls, sync ranges, and exclusions.
- Account and calendar metadata, rename, delete/disconnect, and mapping management.
- Settings, password changes, passkeys where native support is validated, API tokens,
  analytics consent, subscription management, feedback, problem reports, and Keeper
  account deletion.
- Commercial/free and self-hosted behavior. Noncommercial instances remain Pro and do
  not show billing UI.

### Mobile-native product capabilities

These already exist in `/api/v1` or the MCP toolset but are not fully surfaced by the
web dashboard. They should ship after the core shell, without delaying basic parity:

- Event detail, create, update, delete, and native sharing.
- Pending invitations and RSVP.
- Free-time search and shareable proposed slots.
- Manual sync, pause/resume, reauthentication warnings, and direct recovery links.
- Push notifications for reauthentication, durable sync failure, and invitations.
- Optional explicit "Add to device calendar" and "Open in provider" actions.

### Explicit exclusions

- Public marketing, blog, privacy, and terms pages remain web content opened in the
  system browser. They do not need native replicas.
- The hidden `/dashboard/connect/ics-file` placeholder remains unsupported until the
  product actually supports snapshot upload.
- The device does not perform Keeper's provider sync locally and does not silently
  mirror all Keeper calendars into the OS calendar database.
- Widgets, App Intents/Shortcuts, and Android equivalents are post-launch extensions,
  not core parity blockers.

## Product information architecture

Use four stable native tabs so Android remains within the recommended tab count:

1. **Today** — agenda, event activity, invitations, event detail, event editing, and
   sync health.
2. **Calendars** — accounts, calendars, provider connection, setup, mappings, and
   calendar privacy/sync configuration.
3. **Find Time** — calendar filters, duration/range/working hours, results, sharing,
   and event creation.
4. **Settings** — profile, security, plan, API tokens, iCal feed, notifications,
   consent, support, about/legal, and account deletion.

Proposed Expo Router tree:

```text
applications/mobile/
  app/
    _layout.tsx
    index.tsx
    +not-found.tsx
    (auth)/
      _layout.tsx
      login.tsx
      register.tsx
      verify-email.tsx
      forgot-password.tsx
      reset-password.tsx
      callback.tsx
    (tabs)/
      _layout.tsx
      today/
        _layout.tsx
        index.tsx
        activity.tsx
        invitations.tsx
      calendars/
        _layout.tsx
        index.tsx
        connect.tsx
      find-time/
        _layout.tsx
        index.tsx
        results.tsx
      settings/
        _layout.tsx
        index.tsx
        profile.tsx
        security.tsx
        passkeys.tsx
        api-tokens.tsx
        ical.tsx
        notifications.tsx
        privacy.tsx
        plan.tsx
        feedback.tsx
        report.tsx
        about.tsx
    account/[accountId]/
      index.tsx
      setup.tsx
    calendar/[calendarId].tsx
    event/
      new.tsx
      [eventId].tsx
      [eventId]/edit.tsx
    open/[...path].tsx
  src/
    api/
    auth/
    components/
    design/
    features/
    navigation/
    notifications/
    offline/
    providers/
    storage/
    testing/
```

Route files contain composition and navigation only. Reusable and platform-specific
components live under `src/components` or feature directories. Expo Router route
files must not rely on `.ios.tsx` or `.android.tsx` variants.

## Design approach

- Start with React Native primitives for virtualized agenda and account/calendar
  collections.
- Start with universal `@expo/ui` components, wrapped in `Host`, for bounded native
  forms, grouped settings, switches, pickers, buttons, and sheets.
- Use `@expo/ui/swift-ui` or `@expo/ui/jetpack-compose` only when the universal layer
  lacks required behavior. Isolate those trees in platform-specific component files
  outside `app/`.
- Preserve Keeper's semantic neutral palette and light/dark behavior, not literal web
  CSS values. Use native semantic colors, Dynamic Type, accessibility labels, reduced
  motion, safe areas, and platform-standard touch targets.
- Preserve provider icons and Keeper marks from
  `applications/web/public/integrations` and `applications/web/public/keeper.svg`,
  adapted into mobile-safe assets.
- Use native large titles sparingly. Compact inline headings and grouped rows should
  remain the dominant Keeper visual signature.
- Use haptics only for committed actions, destructive confirmations, successful copy,
  and refresh completion. Never turn continuous sync updates into repeated haptics.
- Prefer a semantic React Native token layer and ordinary styles. Adopt NativeWind
  only after an explicit styling ADR; do not mix two unowned styling systems.

## Technical architecture

### Workspace packages

Add:

```text
applications/mobile          Expo Router application
packages/api-contracts       Runtime-safe request/response/error/socket schemas
packages/api-client          Fetch client, auth header/cookie adapter, retries, errors
packages/design-tokens       Optional platform-neutral Keeper tokens/assets metadata
```

The mobile app may directly consume client-safe exports from
`@keeper.sh/data-schemas` and `@keeper.sh/constants`. It must not import
`@keeper.sh/auth`, database, calendar, sync, queue, broadcast, premium, or server
telemetry packages; those pull Bun, database, secrets, or server runtime assumptions
into Metro.

Move duplicated response DTOs from `applications/web/src/types/api.ts` and
`services/api/src/types.ts` into runtime-validated contracts. Cover accounts,
calendars, detailed settings, entitlements, mappings, events, iCal settings, API
tokens, feedback results, sync status, socket URL, and error envelopes. Both the web
and mobile clients should consume the same contracts.

### Recommended app stack

- Expo SDK 57 with Expo Router, TypeScript, and the New Architecture.
- `@expo/ui` universal components; platform packages only for proven gaps.
- Better Auth with `@better-auth/expo` and `expo-secure-store`.
- TanStack Query with persisted, schema-versioned SQLite cache, unless a short spike
  proves SWR materially improves web/mobile sharing.
- `expo-linking`, `expo-web-browser`, `expo-notifications`, `expo-local-authentication`,
  `expo-haptics`, `expo-clipboard`, `expo-sharing`, and optional `expo-calendar`.
- React Native `FlatList`/`SectionList` first. Add FlashList only after profiling.
- EAS development builds once push, associated links, or native targets are tested.

Do not put a new backend in Expo API Routes. The existing Bun API remains the system
boundary and supports hosted and self-hosted deployments.

## Authentication and server selection

The recommended baseline is Better Auth's official Expo integration:

1. Add the `@better-auth/expo` server plugin in `packages/auth/src/index.ts`.
2. Add production app schemes and associated HTTPS origins to trusted origins. Keep
   broad `exp://` patterns development-only.
3. Configure the mobile `expoClient` with SecureStore so cookies and session state are
   persisted securely and added to API requests.
4. Make API base URL explicit. The hosted build defaults to `https://www.keeper.sh`;
   self-hosted users can configure and validate another HTTPS origin.
5. Use `/api/auth/capabilities` before rendering auth so hosted email, self-hosted
   username-only, social provider, reset, and passkey capabilities remain accurate.
6. Add integration tests for origin validation, cookie forwarding, logout/revocation,
   session expiry, switching server profiles, and cross-profile data isolation.

Treat this as an ADR-backed spike before broad UI implementation. If secure cookies
cannot meet hosted plus self-hosted requirements, fall back to a first-party public
OAuth client using authorization code + PKCE, scoped access/refresh tokens, explicit
audience, rotation, revocation, and shared auth extraction for internal and `/api/v1`
routes. Never use user-created `kpr_` API tokens as the app session.

Native biometrics initially lock local access to the stored session. Do not advertise
biometrics as account authentication or claim passkey parity until native passkeys,
RP association, recovery, and cross-platform behavior pass physical-device tests.

## Provider OAuth handoff

Current provider authorization and callback code in
`services/api/src/routes/api/sources/authorize.ts`,
`services/api/src/routes/api/sources/callback/[provider].ts`, and the equivalent
destination routes assumes web dashboard callbacks.

Add a server-owned mobile handoff:

1. App requests provider authorization with a signed, allowlisted return intent.
2. Server stores nonce, user/session, provider, purpose, destination/source context,
   app return path, and expiry in one-time state.
3. System browser performs provider OAuth against the server callback.
4. Server redirects to an associated link or `keeper://` fallback containing only a
   short-lived one-time ticket.
5. App exchanges the ticket, refreshes accounts/calendars, and resumes setup.

Never accept an arbitrary return URL. Bind state to the initiating user/session,
consume it once, expire it quickly, and avoid placing provider tokens or credentials
in URLs. Use the existing Redis state patterns in
`services/api/src/utils/oauth-callback-state.ts` as a starting point.

## Offline, sync, and realtime

- Keeper's server remains the only sync engine. Mobile observes status and invokes the
  throttled server sync endpoint; background execution never performs provider sync.
- Cache bounded agenda windows, account/calendar metadata, entitlements, and safe
  settings in SQLite. Store only sessions/secrets in SecureStore.
- Minimize cached event fields and honor privacy expectations. Show stale/offline
  state and last refresh time.
- Initial offline mode is read-only. Mutations require connectivity. If an outbox is
  later introduced, require idempotency keys and server version/conflict checks; do
  not silently queue destructive mutations.
- Reuse socket validation from `@keeper.sh/data-schemas/client` and the reconnect,
  ordering, and stale-aggregate rules in
  `applications/web/src/providers/sync-provider-logic.ts`.
- Background refresh may warm the cache and rotate push tokens on a best-effort basis.
  It must not promise operating-system scheduling guarantees.

## Notifications, links, and device features

Add a device-installation model and authenticated register/rotate/revoke endpoints
with user ID, opaque token, platform, environment, app version, locale/timezone,
last-seen, and disabled timestamp. Add notification preferences and durable dedupe IDs.

Push only durable domain changes: reauthentication required, durable sync failure,
and invitations. Use opaque resource IDs and versioned internal paths; omit event
titles, descriptions, locations, and account names from lock-screen payloads by
default. Restore pending deep-link intent after authentication.

Use `https://keeper.sh/open/...` associated links with `keeper://` fallback. Define a
separate, secure server-profile handoff for self-hosted instances; a hosted universal
link must not silently choose an arbitrary server.

High-value native affordances:

- Pull to refresh and manual sync with clear one-minute throttle feedback.
- Share event or free-time details through the native share sheet.
- Copy/share the iCal URL with an explicit privacy warning.
- Context menus and swipe actions for RSVP and safe event actions.
- Just-in-time permission for explicit device-calendar writes.
- Quick actions for New Event, Find Time, and Sync Now after core flows stabilize.
- Privacy-redacted widgets/shortcuts only after real usage validates them.

## Billing decision gate

Commercial web checkout is Polar-backed and returns to dashboard URLs. Before beta,
obtain a storefront policy/legal decision for iOS and Android:

- permitted system-browser account management and purchase flow; or
- native App Store / Play billing with server-side entitlement reconciliation.

Do not blindly embed Polar checkout. Until the decision is recorded, the app may show
current entitlements and a Manage Plan action only where policy permits. Preserve the
web's subscription convergence behavior: a transient billing failure must not silently
downgrade a known payer. `/api/entitlements` remains the stable feature gate, and
self-hosted/noncommercial instances remain Pro.

## Feature parity matrix

The matrix below records the pre-implementation source-to-mobile mapping. Its contract
and endpoint gaps are implemented in this worktree unless the row explicitly names a
physical-device, relying-party, or storefront-policy gate.

| Capability | Existing web route | Existing API endpoint(s) | Mobile destination | Gap / contract work | Target |
| --- | --- | --- | --- | --- | --- |
| Login/register/capabilities | `/login`, `/register` | `/api/auth/*`, `/api/auth/capabilities` | `(auth)` | Expo plugin, trusted origins, SecureStore | P0 |
| Verification/reset/logout | `/verify-email`, `/forgot-password`, `/reset-password`, Settings | `/api/auth/*` | `(auth)` and Settings | Mobile return links and session tests | P0 |
| Social login | `/auth/google`, `/auth/outlook` | Better Auth social endpoints | `(auth)` | Native callback handoff | P0 |
| Passkeys | Login, `/dashboard/settings/passkeys` | Better Auth passkey endpoints | Settings > Security | Native/RP association validation | P2 |
| Sync state and progress | `/dashboard` | `/api/sync/status`, `/api/socket/url`, `/api/socket` | Today header/activity | Shared status/socket contracts | P1 |
| 15-day activity graph | `/dashboard` | `/api/events/count` | Today > Activity | Typed bucket/count response | P1 |
| Provider chooser | `/dashboard/connect` | `/api/entitlements`, auth capabilities | Calendars > Connect | Shared capabilities and limit errors | P1 |
| Google/Outlook/M365 connect | `/dashboard/connect/{google,outlook,microsoft}` | `/api/sources/authorize`, `/api/sources/callback/:provider`, provider calendar-list/create routes | Connect flow | One-time mobile OAuth return ticket | P1 |
| iCloud/Fastmail/CalDAV | `/dashboard/connect/{apple,fastmail,caldav}` | `/api/sources/caldav/discover`, `/api/sources/caldav` | Connect flow | Shared discovery/connect DTOs | P1 |
| Remote ICS feed | `/dashboard/connect/ical-link` | `/api/ics` | Connect flow | Shared validation/create DTOs | P1 |
| Account setup wizard | `/dashboard/accounts/:accountId/setup` | `/api/accounts/:id`, `/api/sources`, mapping routes | Account setup | Typed step state, calendars, mappings | P1 |
| Account detail/delete | `/dashboard/accounts/:accountId` | `/api/accounts/:id` | Account detail | Shared DTOs and error envelope | P1 |
| Calendar detail/rename | `/dashboard/accounts/:accountId/:calendarId` | `/api/sources/:id` | Calendar detail | Shared detail DTO and PATCH schema | P1 |
| Mapping fan-out | Setup and calendar detail | `/api/sources/:id/destinations`, `/api/sources/:id/sources` | Calendar/setup | Limit and `402` error contracts | P1 |
| Sync ranges | Calendar detail | `/api/sources/:id` | Calendar settings | Entitlement and range option contract | P1 |
| Privacy/templates/exclusions | Calendar detail | `/api/sources/:id` | Calendar settings | Shared validation and serialized writes | P1 |
| Forward agenda | `/dashboard/events` | `/api/events` | Today | Paged response and offline cache | P1 |
| Aggregated iCal URL/settings | `/dashboard/ical` | `/api/ical/token`, `/api/ical/settings`, `/api/v1/ical` | Settings > iCal | Shared token/settings DTOs | P1 |
| Change password | `/dashboard/settings/change-password` | Better Auth password endpoints | Settings > Security | Mobile session/reauth behavior | P1 |
| API tokens | `/dashboard/settings/api-tokens` | `/api/tokens`, `/api/tokens/:id` | Settings > API Tokens | Typed one-time reveal/revoke | P2 |
| Analytics consent | `/dashboard/settings` | No dedicated product endpoint | Settings > Privacy | Local consent and telemetry policy | P1 |
| Upgrade/manage plan | `/dashboard/upgrade`, Settings | Better Auth/Polar checkout, customer state, portal; `/api/entitlements` | Settings > Plan | Storefront/billing ADR and mobile returns | P2 gate |
| Feedback/problem report | `/dashboard/feedback`, `/dashboard/report` | `/api/feedback` | Settings > Support | Typed submission result | P1 |
| Keeper account deletion | `/dashboard/settings` | Better Auth delete-user endpoint | Settings > Profile | Reauth and shared error contract | P2 |
| Event detail/CRUD | No web UI; API/MCP only | `/api/v1/events`, `/api/v1/events/:id` | Today/event sheets | Runtime request/response contracts | P2 |
| Invitations/RSVP | No web UI; API/MCP only | `/api/v1/calendars/:calendarId/invites`, `/api/v1/events/:id` | Today > Invitations | Runtime request/response contracts | P2 |
| Find free time | No web UI; API/MCP only | `/api/v1/events/free-time` | Find Time | Runtime request/response contracts | P2 |
| Manual sync/pause | Status only on web | `/api/v1/sync`, `/api/v1/calendars/:calendarId` | Today/Calendar actions | Throttle, pause, and retry contracts | P2 |
| Reauthentication | Backend flag only | No supported recovery endpoint | Today/Account warning | New typed recovery flow | P2 |
| Push notifications | None | No device/push endpoints | Cross-app | New device model, preferences, delivery | P2 |
| Marketing/blog/legal | `/`, `/features`, `/pricing`, `/blog/*`, `/privacy`, `/terms` | Web content | Settings/About link-out | None | Web only |
| ICS file placeholder | Hidden `/dashboard/connect/ics-file` | No supported upload API | None | None | Excluded |

P0 is backend and architecture readiness, P1 is authenticated web parity beta, and P2
is security/billing completion plus mobile-native calendar operations.

## Delivery phases and acceptance criteria

### Phase 0 — contracts and native auth spike

- Create the mobile workspace, contract package, API client package, and minimal Router
  shell without feature screens.
- Prove hosted email login, self-hosted username login, session restore, logout, expiry,
  and authenticated `/api/accounts` on physical iOS and Android devices.
- Prove provider OAuth round trip with one-time return state in development.
- Record auth, styling, query/cache, server-profile, and billing ADRs.
- Add Turbo type/lint/test tasks and CI smoke checks.

Exit: no API token workaround, no provider token in a URL, shared contract validation
works on server and mobile, and server profile data cannot bleed across accounts.

### Phase 1 — authenticated parity beta

- Today status/activity/agenda and realtime state.
- Accounts/calendars, all connection flows, setup/rename/mappings, calendar settings,
  privacy controls, and deletion.
- iCal settings, password changes, analytics consent, feedback/report, basic plan state.
- Offline cached reads, loading/empty/error/retry/stale states, and accessibility.

Exit: every P1 matrix row passes on iOS and Android against hosted and self-hosted test
instances, including free/Pro limits and dark mode.

### Phase 2 — mobile calendar operations and release readiness

- Event CRUD, RSVP, invitations, free time, manual sync, pause/resume, and reauth.
- Push registration/preferences/deep links, biometric app lock, API tokens, passkey
  decision, account deletion, and compliant billing/account management.
- Performance monitoring, privacy review, store assets, support/runbooks, and beta E2E.

Exit: critical E2E journeys pass on physical devices, security/privacy review closes,
store policy decision is implemented, crash-free/performance thresholds are met, and
notification content is redacted by default.

### Phase 3 — validated native extensions

- Quick actions, widgets, App Intents/Shortcuts, Android equivalents, and selected
  actionable notifications based on measured demand.

## Testing and observability

- Unit-test contracts, URL/server normalization, date/timezone/DST logic, auth/session
  state, reducer/order logic, deep links, notification routing, permissions, and cache
  migrations.
- Use React Native Testing Library for loading, empty, offline, stale, error, locked,
  entitlement, reduced-motion, Dynamic Type, and screen-reader states.
- Run service-level contract tests against real route handlers, including status/error
  envelopes, origin validation, OAuth state replay/expiry, plan limits, sync throttle,
  and idempotency.
- Use Maestro E2E on iOS and Android for auth, provider callback, setup/mapping,
  settings, event CRUD/RSVP/free time, deep links, notification taps, and deletion.
- Require physical-device smoke tests for social OAuth, provider OAuth, push,
  biometrics, associated links, and passkeys.
- Add performance monitoring with EAS Observe on SDK 57 (`ObserveRoot`, Router
  integration, and `markInteractive`) using PII-free events. Pair it with current
  server OpenTelemetry rather than duplicating provider/sync telemetry on-device.
- Initial targets: cold launch under 1.5 s, warm launch under 0.5 s, time to render under
  2 s, time to interactive under 3 s on supported reference devices. Revisit with beta
  percentiles rather than treating lab numbers as permanent SLOs.

Test matrix dimensions: iOS/Android, hosted/self-hosted, commercial/noncommercial,
email/username/social, free/Pro, online/offline/stale, light/dark, and small/large text.

## Required ADRs

1. Better Auth Expo secure-cookie session versus PKCE bearer fallback.
2. Hosted and self-hosted server-profile discovery, switching, and associated links.
3. Provider OAuth one-time mobile return ticket.
4. Shared contract package ownership and API versioning policy.
5. TanStack Query versus SWR and SQLite persistence boundaries.
6. React Native semantic styles versus NativeWind adoption.
7. Native passkey release scope.
8. App Store/Play billing and Polar entitlement reconciliation.
9. Notification privacy defaults and durable event sources.
10. Event detail privacy: whether the mobile UI exposes titles/details by default,
    given the current web agenda's intentionally limited rendering.

## Implemented application

The worktree contains the complete planned application rather than a narrow vertical
slice. It includes the shared contract and client packages, Better Auth Expo support,
strict mobile origins, durable provider OAuth tickets, the four-tab native shell, all
authenticated web-product workflows, mobile event/invitation/free-time operations,
bounded offline reads, biometric app lock, deep links, notification preferences and
device registration, durable push delivery, and EAS Observe integration.

The remaining gates are environmental release validation, not deferred product
screens: apply migrations `0082` and `0083` against PostgreSQL, exercise the Maestro
matrix against seeded hosted and self-hosted servers, and validate provider/social
OAuth, APNs/FCM delivery and receipts, associated links, biometrics, and native
passkey relying-party association on physical iOS and Android devices. Storefront
policy approval is also required before treating browser-based commercial plan
management as production-approved on both stores.
