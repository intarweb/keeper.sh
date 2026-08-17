# Mobile push delivery

Keeper's mobile notifications use a durable database outbox. API and sync-worker
producers only commit privacy-safe notification intents; the worker owns all network
delivery to the Expo Push Service.

## Notification lifecycle

1. A producer inserts one `push_notification_outbox` row with an idempotency key.
2. The worker materializes one `push_notification_deliveries` row per currently
   enabled device installation. The unique notification/installation constraint
   makes this safe after a crash or overlapping worker pass.
3. The worker claims bounded send batches and records the Expo ticket receipt ID.
4. A later pass claims due receipts. Successful receipts finish the delivery;
   transient errors retry with bounded exponential backoff.
5. `DeviceNotRegistered` permanently disables and clears the installation token.
   Permanent credential/sender/payload failures are dead-lettered. A notification is
   complete when all of its per-device deliveries are terminal.

Claims become eligible again after five minutes, so a worker can safely recover work
left in `processing`. Send and receipt processing stop after eight failed attempts.
Turning push dispatch off leaves outbox rows intact.

Disabling a notification category atomically tombstones its queued outbox work. The
worker also rechecks current preferences before claiming a delivery, which closes the
producer/update race. Delivered and dead outbox rows (and their cascading delivery
rows) are retained for 30 days, then removed in bounded batches.

## Producers and privacy

- OAuth grant failures and cron source-ingestion reauthentication-demand transitions
  enqueue `reauthentication_required` intents. Cron keeps converging the intent while
  the demand is raised, cancels unsent work on recovery, and releases the cycle key
  so a later failure can notify again.
- Failed calendar sync jobs enqueue `sync_failed` intents.
- Google, Outlook, and CalDAV source adapters normalize only pending invitation
  identity (provider UID and occurrence start). The cron ingestion transaction writes
  the corresponding `calendar_invite` intent atomically with event state and provider
  cursor changes. Attendee names, addresses, and response data never enter Keeper's
  syncable event model. The pending-invitation endpoint converges the same hashed
  idempotency key as a fallback.

Every producer checks the user's independent notification preference. Payloads carry
only opaque identifiers and a Keeper deep link. Expo-visible titles and bodies do not
contain event names, descriptions, locations, organizer addresses, provider errors,
or access credentials.

## Worker configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUSH_OUTBOX_ENABLED` | `true` | Start the outbox loop with the worker. |
| `PUSH_OUTBOX_BATCH_SIZE` | `50` | Bound each materialize, send, and receipt claim. |
| `PUSH_OUTBOX_INTERVAL_MS` | `5000` | Milliseconds between passes. |
| `EXPO_PUSH_ACCESS_TOKEN` | unset | Bearer token for Expo enhanced push security. |

The worker emits a `push_outbox.batch` wide-log event with materialized, sent,
receipt-pending, delivered, retried, and dead counts. Transport exceptions and Expo
error text are truncated before persistence.

## Operations

- To pause delivery during an incident, set `PUSH_OUTBOX_ENABLED=false` and restart
  workers. Do not delete the outbox.
- A rising retry count normally indicates Expo/network availability. A rising dead
  count indicates invalid installations, project credentials, sender mismatch, or an
  oversized message.
- Run database migrations before enabling updated workers. The delivery processor
  requires the `push_notification_deliveries` migration.
