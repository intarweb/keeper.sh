# Mobile device and Maestro validation

## Fixture contract

These flows target disposable, non-production Keeper fixtures. Build with
`EXPO_PUBLIC_KEEPER_SERVER_URL=https://keeper.sh` for the hosted flows and pass
all secrets at runtime. Never commit them.

The hosted fixture needs a verified email user, one writable push-capable
calendar, one pull+push setup calendar, a separate mapping candidate, and a
pending invitation with a unique title. The self-hosted fixture must expose
username authentication.

```sh
maestro test \
  -e KEEPER_E2E_EMAIL=e2e@example.invalid \
  -e KEEPER_E2E_PASSWORD='fixture-password' \
  -e KEEPER_E2E_ACCOUNT_ID='fixture-account-id' \
  -e KEEPER_E2E_SETUP_CALENDAR='Setup Fixture' \
  -e KEEPER_E2E_MAPPING_CALENDAR='Mapping Fixture' \
  -e KEEPER_E2E_INVITATION_TITLE='Unique RSVP Fixture' \
  -e KEEPER_E2E_SELF_HOSTED_URL='https://keeper-e2e.example.invalid' \
  -e KEEPER_E2E_SELF_HOSTED_HOST='keeper-e2e.example.invalid' \
  -e KEEPER_E2E_SELF_HOSTED_USERNAME='maestro-user' \
  -e KEEPER_E2E_SELF_HOSTED_PASSWORD='fixture-password' \
  applications/mobile/.maestro/flows
```

Run `offline-restart-android.yaml` on Android only; `toggleAirplaneMode` is not
available to iOS simulators. Event and RSVP flows mutate and clean their own
fixture data. The setup flow changes mappings, and the RSVP fixture is consumed,
so reseed those records before each run. The account deletion flow verifies the
native destructive confirmation and cancels without deleting the user.

## Automated coverage

- Hosted email and self-hosted username authentication/server selection.
- Native tab navigation and supported deep-link routes.
- Direct event creation, detail mutation affordances, and deletion cleanup.
- Occurrence-specific invitation RSVP.
- Account calendar selection, rename progression, and mapping mutation.
- Android offline process restart with the cached agenda.
- Permanent-account-deletion confirmation without executing deletion.

## Required physical-device matrix

External OAuth, APNs/FCM delivery, biometric prompts, passkeys, verified HTTPS
links, and store-signed adaptive icons remain in the physical release matrix;
simulator automation cannot faithfully assert provider/browser or signing state.

| Platform | Required devices | Orientations / windows | Core checks |
| --- | --- | --- | --- |
| iOS | Current iPhone plus oldest supported iOS iPhone | Portrait and landscape | Email/social OAuth return, provider OAuth return, passkey/RP association, Face ID/Touch ID lock, notification registration/tap routing, universal links, share sheet, calendar/date controls |
| iPadOS | 11-inch iPad plus one compact iPad size | Portrait, landscape, Split View at 1/3 and 1/2 | 760pt content cap, form-sheet detents/keyboard, large-title collapse, tab/sidebar adaptation, rotation without lost form state |
| Android | Current Pixel plus oldest supported API phone | Portrait and landscape | Email/social OAuth return, provider OAuth return, biometric lock, notification channels/tap routing, verified app links, masked adaptive icon, Android date/time dialogs, back gesture |
| Android large screen | Tablet or foldable emulator plus one physical foldable/tablet when available | Expanded, split-screen, folded/unfolded | Responsive width, adaptive icon masks, state retention across resize, navigation and sheet behavior |

On every release candidate, repeat primary paths with VoiceOver and TalkBack,
the largest Dynamic Type/font-size setting, Bold Text, Reduce Motion/Remove
animations, Increase Contrast, light and dark appearance, 24-hour time, a
non-English locale, and an offline-to-online transition. Confirm actionable
controls remain at least 48×48 points/dp and every selected checkbox/radio row
announces its current state. Capture failures with OS, device, appearance,
content-size category, route, and fixture revision.
