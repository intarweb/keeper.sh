# sync-kit learnings ledger

One file, one ledger per package. `@keeper.sh/sync-protocol` is first (entries 1–60); the
`@keeper.sh/sync-ical` ledger follows it (entries `ICAL-I1`–`ICAL-I60`). Sibling packages append their own
section rather than renumbering anyone.

## sync-protocol

Every lesson mined from `packages/calendar`, `packages/sync` and their git history, mapped to the design
element in `@keeper.sh/sync-protocol` that honours it — or marked NOT APPLICABLE with the reason.

Entries 1–33 come from the existing code and its commit history. Entries 34–43 come from provider and RFC
research. Entries 44–49 are the explicit not-applicable set. Entries 50–55 are lessons that belong to
sibling sync-kit packages, recorded here so their absence from the protocol reads as a decision.
Entries 56–60 were added after adversarial review found them missing; 60 is not applicable.

Every **Proved by** citation names a file under `packages/sync-kit/protocol/tests` and the exact test name
inside it, so the ledger can be walked against the suite mechanically.

---

## Adopted

### 1. An empty listing must never mean "the calendar is empty"

**Lesson.** A body that never opened a VCALENDAR, a CalDAV collection where every resource failed to parse,
and a failed HTTP fetch all parsed to zero events, and the snapshot diff read zero events as "delete
everything the user has".
**Learned from.** `packages/calendar/src/ics/utils/parse-ics-calendar.ts`,
`providers/caldav/shared/ics.ts`, `ics/utils/fetch-adapter.ts`; commit `0184ea19` *fix(ics): don't wipe
existing events when remote fetch fails (#383)*; test *"propagates fetch errors instead of returning empty
events"*.
**Honoured by.** `ChangeListing` is a four-member discriminated union. Only `snapshot` carries a
`CoverageWindow`, and only a `snapshot` may be passed to `DeriveSnapshotRemovals`. `partial` and
`cursorLost` declare `coverage?: never` and `removals?: never`, so an unproven read is structurally
incapable of producing a deletion. A read that fails entirely is `Result.ok === false`, never an empty
listing. **Proved by.** `deletion.test-d.ts :: DeriveSnapshotRemovals rejects a partial listing`; `deletion.test-d.ts :: DeriveSnapshotRemovals rejects a cursorLost listing`; `change-listing.test-d.ts :: a partial listing can never carry removals`.

### 2. Deletion authority differs between snapshot and delta sources

**Lesson.** A delta feed reports only changes, so absence means "unchanged"; a snapshot feed re-reports its
whole coverage, so absence means "gone". Carried as an `isDeltaSync` boolean through every diff.
**Learned from.** `core/source/event-diff.ts` (`buildSourceEventStateIdsToRemove`),
`core/sync-engine/ingest.ts` (`getNonRecurringStoredEventIdsOutsideWindow`).
**Honoured by.** The distinction is the `kind` discriminant, not a flag. `delta` carries `removals` and has
no function that accepts it together with `KnownEvents`; `snapshot` carries `coverage` and derives absence
only within it. **Proved by.** `deletion.test-d.ts :: a delta listing cannot express delete-everything-not-listed`; `deletion.test-d.ts :: an outOfScope removal never drives a deletion`.

### 3. A deletion may only be inferred inside a proven coverage window

**Lesson.** Coverage is re-read under lock and only ever narrowed mid-run; a destination with no mapped
sources gets no window at all, or a freshly imported calendar deletes every Keeper-tagged event another row
put there.
**Learned from.** `packages/sync/src/sync-user.ts:218-224, 777-792`; `coverage` on `FetchEventsResult`.
**Honoured by.** `CoverageWindow` is a required, distinctly-shaped field
(`{ covered, calendar }` — deliberately not the same shape as the requested `TimeWindow`)
on `snapshot` and `delta`, absent from `partial` and `cursorLost`. `DeriveSnapshotRemovals` takes **no**
coverage argument at all: the only window in scope is `listing.coverage`, so a caller cannot hand it a
window wider than the one the provider proved. The membership predicate arrives as an argument
(`WindowMembership`, entry 17) rather than being re-implemented per call site. What the types cannot state
is that `listing.scope.calendar`, `listing.coverage.calendar` and `known.calendar` name one calendar —
two values of one type are indistinguishable to the compiler — so that agreement is a named runtime
obligation, `ProviderConformanceSuite.deletionInputsShareOneCalendar`. **Proved by.** `change-listing.test-d.ts :: a snapshot listing cannot omit its coverage window`; `change-listing.test-d.ts :: a requested window is not a proven coverage window`; `deletion.test-d.ts :: the only coverage window a snapshot removal can use is the one the listing proved`.

### 4. An unrepresentable event must be WITHHELD, not filtered out

**Lesson.** Filtering an unparseable VEVENT out of the feed made the diff treat it as absent and delete the
stored state the user still has. Same for a recurrence series over the occurrence budget.
**Learned from.** `ics/utils/fetch-adapter.ts:394-399`, `core/sync-engine/ingest.ts:323-327`,
`core/sync/operations.ts:567-573`; tests `ics-floating-date-telemetry` *"never deletes the stored row of the
event it withholds"*.
**Honoured by.** Every `ChangeListing` variant that carries events carries a required
`withheld: readonly WithheldEvent[]`, and `DeriveSnapshotRemovals` reads its input's `withheld` as present
ids. `cursorLost` declares `withheld?: never` for the same reason it declares `events?: never` — it
observed nothing, so it withheld nothing. Withholding is cheaper to write than filtering. A withheld event
is identified by its UID **or** by the provider's own id: `WithheldIdentity` is a union, so a publisher
that stripped one of the two before deleting still has a legal shape (entry 58) and never has to be
dropped silently. **Proved by.** `deletion.test-d.ts :: withheld ids are part of the deletion-inference input`; `diagnostics.test-d.ts :: a publisher that stripped the UID before deleting still has a withheld shape`.

### 5. One bad event must not stall the whole feed

**Lesson.** A single VEVENT with an hour-based all-day DURATION, a negative DURATION, a THISANDFUTURE
override, `tzone://Microsoft/Custom` or a malformed dateTime threw out of the fetch; nothing was applied,
the delta token never advanced, and the source never converged.
**Learned from.** commit `fdd9ba62` (#634); commit `43292a9f` (#606);
`tests/ics/utils/ics-malformed-vevent-telemetry.test.ts`.
**Honoured by.** Per-event failure is `WithheldEvent` inside a *successful* listing. `ProviderFailure` is
reserved for whole-listing failures. Adapters return `Result`, never throw. **Proved by.** `provider-shape.test-d.ts :: no awaiting method returns a bare value; every one returns a Result`; `provider-failure.test-d.ts :: normalization can refuse an event without throwing or mislabelling it`.

### 6. Every discard needs a counter

**Lesson.** Ingest silently deleted rows with zero telemetry: CalDAV hardcoded `unrepresentable: 0`, ICS
reported nothing, and Keeper's own mirrors were folded into `unrepresentable` so the counter was
permanently non-zero on mirrored calendars.
**Learned from.** commit `fdd9ba62` (#634); `DiscardedSourceEventCounts` in `core/sync-engine/ingest.ts`.
**Honoured by.** `ListingDiagnostics` is a required field on all four listing kinds, with `withheld`,
`selfAuthored` and `unrepresentable` as *separate* `BoundedSample` fields. Required, so every adapter
author must answer the question. **Proved by.** `diagnostics.test-d.ts :: the counters are required, not optional`; `diagnostics.test-d.ts :: selfAuthored and unrepresentable are separate counters`.

### 7. Self-authored events must be recognised at the source read

**Lesson.** Keeper tags its own mirrors (UID suffix, PRODID); without filtering them the mirror is
re-ingested as a source event and echoed around the loop.
**Learned from.** `core/events/identity.ts` (`isKeeperEvent`, `KEEPER_EVENT_SUFFIX`); `selfAuthoredCount`
in all four fetch adapters; `RemoteEvent.isKeeperEvent`.
**Honoured by.** `RemoteEvent` is a union over provenance: `ForeignEvent | OwnEvent | IndeterminateEvent`.
Only `ForeignEvent` is assignable to the write-intent builder type. `selfAuthored` is its own diagnostics
field. **Proved by.** `provenance.test-d.ts :: an OwnEvent is not assignable to a mirror write-intent builder`; `provenance.test-d.ts :: only a ForeignEvent is a mirror source`.

### 8. Echo must be three-state

**Lesson.** A successful push with no echo verdict counts as uncomparable; a zero divergence count that
silently meant "unchecked" hid a real drift class.
**Learned from.** `core/sync-engine/index.ts` (`tallyPushEcho`), `core/events/push-echo.ts`; tests
`push-echo-attribution`, `push-echo-length-attribution`.
**Honoured by.** `EchoVerdict = matched | diverged | notObserved`, required on `created`/`updated`
outcomes, never an optional boolean. **Proved by.** `write-outcome.test-d.ts :: echo is three-state and a boolean is not assignable`; `write-outcome.test-d.ts :: a created outcome must report what the echo showed`.

### 9. A conditional write needs a real precondition and a distinct conflict outcome

**Lesson.** `PushResult { success, remoteId, error }` was too weak; `conflictResolved` had to be bolted on
as a separate counter. CalDAV refuses to recreate an object with no ETag.
**Learned from.** `providers/caldav/destination/provider.ts:120-133`; `PushResult`/`DeleteResult` in
`core/types.ts`.
**Honoured by.** `precondition` is a required field on `update`, `delete` and `retire` intents, typed as
`ObservedPrecondition` (`matchesVersion | matchesFingerprint`) — `absent` is reachable only from `create`,
so "update it whether or not it changed" and "delete whatever is there" are both unspellable, not merely
discouraged. `WriteOutcome.conflict` and `ProviderFailure.conflict` carry the observed precondition, which
for the same reason cannot be `absent`. **Proved by.** `write-intent.test-d.ts :: an update WriteIntent without a precondition does not compile`; `write-intent.test-d.ts :: an update pinned to absent is not expressible`; `write-outcome.test-d.ts :: there is no outcome in which a mismatched precondition succeeded`.

### 10. A replayed create must be a typed no-op

**Lesson.** Mirrors are written under a deterministic UID so a retried push resolves to the same object;
CalDAV re-fetches `${uid}.ics` and returns early on a content-hash match.
**Learned from.** `core/events/identity.ts` (`generateDeterministicEventUid`);
`providers/caldav/destination/provider.ts:90-118`; tests *"re-reads an unchanged feed as no work at all"*.
**Honoured by.** `create` carries a required `idempotencyKey` and a `precondition` pinned to
`{ kind: "absent" }`. `WriteOutcome` has `alreadyExists` and `unchanged` members distinct from `created`.
**Proved by.** `write-intent.test-d.ts :: a create's precondition can only be absent`; `write-intent.test-d.ts :: a create without an idempotencyKey does not compile`.

### 11. Provider identifiers are not interchangeable

**Lesson.** Google's delete endpoint takes the event id, not the iCalUID; mappings that stored the UID cost
a second batch request per delete.
**Learned from.** `core/sync/operations.ts:482-488`; `RemoteEvent { uid, deleteId }`.
**Honoured by.** Every identity in the package is a tagged handle (`{ kind; value }`), not a string alias:
`RemoteEventId`, `DeleteHandle`, `EventUid`, `RemoteVersion`, `Fingerprint`, `IdempotencyKey`, and also
`AccountId`, `CalendarId`, `InstallationId`, `Instant`, `CalendarDate` and `ZoneId`. Delete/retire intents
take a `DeleteHandle`; update takes a `RemoteEventId`; `CalendarKey`'s three members cannot be permuted;
an `Instant` cannot land in a `CalendarDate` field (entry 44). `ProviderId` is the deliberate exception:
it is the literal domain (`"google"`, `"outlook"`) every generic in the package is parameterised over, and
tagging it would forbid `CalendarProvider<"google">`. `KnownEvents.ids` is a
`ReadonlyMap<string, RemoteEventId>` rather than a `ReadonlySet<string>`, so a set of UIDs — which would
match nothing in the listing and therefore delete everything — is not assignable. **Proved by.** `identifiers.test-d.ts :: a RemoteEventId and a DeleteHandle cannot be swapped`; `identifiers.test-d.ts :: an EventUid is not a RemoteEventId`; `identifiers.test-d.ts :: an AccountId is not a CalendarId, and the three parts of a key cannot be permuted`; `identifiers.test-d.ts :: an Instant is not a CalendarDate`.

### 12. A stale cursor forces a full resync and must clear the token

**Lesson.** Advancing a delta token over a dropped payload strands every event it named. Graph tombstones
can omit the deleted event type; a sparse id may name a series master while local state holds only
instances.
**Learned from.** `providers/outlook/source/utils/fetch-events.ts:382-388`;
`providers/google/source/utils/fetch-events.ts:149`; `ingest.ts` flushing `syncToken: null`.
**Honoured by.** `cursorLost` is its own listing kind carrying `events?: never`, `removals?: never`,
`cursor?: never`, `coverage?: never`. **Proved by.** `change-listing.test-d.ts :: a cursorLost listing carries no events, no removals, no cursor and no coverage`.

### 13. A stored-state parse failure must also force a full sync

**Lesson.** When stored rows fail to parse mid-delta the engine flushes the token; diffing against
partially-parsed local state computes bogus removals.
**Learned from.** `core/sync-engine/ingest.ts:298-304`, `core/source/stored-event-state.ts`.
**Honoured by.** `cursorLost` is constructible by the *consumer*, not only returned by the provider — it is
a plain object type with no provider-private fields, so the engine can synthesise it when its own state is
unusable.

### 14. Reconciliation identity must be canonical and complete

**Lesson.** The identity key stringifies recurrence rule, exception dates, duration, timezone,
availability, all-day flag and trimmed text with sorted structured values, because *"does not diff
equivalent recurrence payloads with different key order"* and *"adds and removes when timezone changes"*
were both production bugs.
**Learned from.** `core/source/event-diff.ts` (`buildSourceEventIdentityKey`); `ics/utils/diff-events.ts`;
`tests/ics/utils/diff-events.test.ts`.
**Honoured by.** `EditableContent` is a named sub-shape holding exactly the comparable fields, separate
from provider metadata, and `Fingerprint` is a tagged handle over it. Adding a field to `EditableContent`
is the single edit; nothing else compares events structurally.

### 15. Normalization runs before reconciliation, never in the serializer

**Lesson.** Otherwise the mapping, the content hash and the bytes on the server disagree and the
destination is replaced on every run forever. The rule survives today only as a JSDoc comment on the
provider interface.
**Learned from.** `core/sync-engine/types.ts:9-11`; `providers/google/destination/normalize-event.ts`;
commit `b057d2e0` (#616).
**Honoured by.** `normalize` is a declared phase returning `NormalizedContent<P>`, and `WriteIntent<P>`
accepts nothing else. Unnormalized `EditableContent` cannot reach `write`, and content normalized for one
provider is not assignable to another's write. The comment is deleted because the type says it. **Proved by.**
`write-intent.test-d.ts :: unnormalized EditableContent cannot reach a write`; `write-intent.test-d.ts :: content normalized for one provider cannot be written to another`.

### 16. Providers refuse ranges that RFC 5545 permits, and each refuses a different set

**Lesson.** A timed VEVENT with no DTEND ends at DTSTART (RFC 5545 §3.6.1); Google 400s an empty range,
Graph refuses end-before-start, CalDAV requires DTEND strictly later. Every rejected push recomputed the
same add on every run — one calendar failed ~50 times/hour — because a rejected push records no mapping.
**Learned from.** commit `b057d2e0` (#616); the four diverged `destination/normalize-event.ts` copies.
**Honoured by.** `Capabilities.representableRange` declares `minimumSpanSeconds`, `zeroDuration`,
`invertedRange` and `allDayGrid` as data, so the engine shapes once per destination.
`WriteOutcome.unrepresentable` carries the violated constraint, so a refusal is typed and recordable rather
than a repeating failure. **Proved by.** `capabilities.test-d.ts :: the representable range is a required declaration`; `provider-failure.test-d.ts :: normalization can refuse an event without throwing or mislabelling it`.

### 17. Window membership must be one predicate shared by every layer

**Lesson.** Copies of `overlapsWindow` diverged across six call sites, each judging a range by its end, so
a zero-duration event on `timeMin` was admitted by some layers and dropped by others — a permanent
add/delete cycle.
**Learned from.** commit `b057d2e0` sub-commits; `core/events/time-range.ts`.
**Honoured by.** The protocol owns `TimeWindow`, `CoverageWindow` and the single predicate *signature*
`type WindowMembership = (window: TimeWindow, time: EventTime) => boolean`, and the one place the protocol
expresses windowing — `DeriveSnapshotRemovals` — takes that predicate as an argument rather than implying
one. A caller therefore passes the shared predicate in; it has nowhere to declare a seventh copy.
Duplication, not the rule, was the defect.

### 18. Reauthentication must be first-class and non-ignorable

**Lesson.** Reauth is detected by an `oauthReauthRequired` marker, by string-matching `invalid_grant`, or
by 401/403 on CalDAV/ICS. Retrying it burns quota and never succeeds.
**Learned from.** `core/oauth/error-classification.ts`; `CalendarFetchError.authRequired`;
`BroadcastSyncStatus.needsReauthentication`.
**Honoured by.** `ProviderFailure` has a `reauthRequired` member carrying the `AccountId`. Consumers switch
with `assertNever`, so omitting the branch fails to compile. **Proved by.** `provider-failure.test-d.ts :: a ProviderFailure switch that omits reauthRequired fails to compile`.

### 19. Never classify failures by matching error message substrings

**Lesson.** A database error message inlines the SQL and its bound parameters, so customer data could match
the backoff patterns and put a healthy destination into exponential backoff.
**Learned from.** `packages/sync/src/destination-errors.ts` (`isDatabaseError`, `BACKOFF_ERROR_PATTERNS`).
**Honoured by.** `ProviderFailure` carries a typed `kind` plus structured fields (`status`, `retryAfter`,
`scope`). There is **no** free-text `message` field anywhere in the protocol. Nothing invites
`message.includes(...)`. Adapters log detail through their own telemetry, not through the contract.

### 20. An unattempted run is neither success nor failure

**Lesson.** Escalating backoff on a superseded run punishes a healthy destination; clearing the count lets
a broken one oscillate between 1 and 0 forever. The verdict is three-state.
**Learned from.** `destination-errors.ts` (`resolveDestinationAttemptVerdict`); `destination-backoff-*`
tests.
**Honoured by.** `notAttempted` is a member of **both** `WriteOutcome` and `ProviderFailure`, carrying
`reason: "superseded" | "aborted" | "budgetExhausted"`. **Proved by.** `write-outcome.test-d.ts :: an unattempted run is neither success nor failure`.

### 21. Retries need a ceiling, provider delays need a cap, sleeps must be abortable

**Lesson.** `withBackoff` caps at 5 retries and caps `Retry-After` at 64s; `abortableSleep` rejects
immediately on an already-aborted signal, removes its listener on timeout and clears its timer on abort.
**Learned from.** `core/utils/backoff.ts`, `core/utils/fetch-with-timeout.ts`; tests *"caps the delay at 64
seconds"*, *"aborts during backoff sleep when signal is triggered"*.
**Honoured by.** Providers do not own retries. `OperationContext` carries a required
`signal: AbortSignal`, a required `deadline: Instant` and a required
`RetryBudget { maxAttempts, retryDelayCeilingMs }` with no defaults — a caller cannot forget the ceiling,
and cancellation is no longer the only bound: a socket nobody aborts still has a wall clock to answer to.
The ceiling is named for what it caps, because `ceilingMs` beside `maxAttempts` reads as a call budget and
is not one. `rateLimited` carries `retryAfter` as data rather than inviting a sleep loop.
**Proved by.** `provider-shape.test-d.ts :: OperationContext.signal cannot be omitted or undefined`; `provider-shape.test-d.ts :: an operation cannot be started without a wall-clock deadline`; `provider-shape.test-d.ts :: a RetryBudget without maxAttempts does not compile`.

### 22. Wide-event identifier lists must be a capped sample beside an uncapped count

**Lesson.** An uncapped list pushes the log line past what the pipeline keeps and takes the counters with
it. Sample 20, 2048-char cap, true total adjacent.
**Learned from.** `core/sync-engine/ingest.ts:22-27`; `sync-user.ts:338-344`; test
`ingest-wide-event-list-bounds`.
**Honoured by.** `BoundedSample = { sample: readonly string[]; total: number }` is the only shape any
diagnostic identifier list may take. A bare `string[]` is not assignable, so the count can never be lost
with the list. The cap itself — 20 entries, 2048 characters — is a contract the type states no more than
the `Fingerprint` contract states RFC 8785 (entry 29): a `readonly string[]` cannot carry a length bound.
The cap is enforced where the sample is built, in the sync-kit telemetry package (entry 55's sibling), and
is stated here as prose because pretending otherwise is how a ledger claim becomes false. **Proved by.** `diagnostics.test-d.ts :: an identifier diagnostic is never a bare array`; `diagnostics.test-d.ts :: a bounded sample keeps the total beside the sample it truncated`.

### 23. Quota must be acquired inside the retried operation

**Lesson.** A batch retry re-sends every sub-request and providers charge per attempt. Google's quota is
per user however spent; Outlook throttles per mailbox. Graph reports throttling as 429 and, for
MailboxConcurrency, as 503 with Retry-After.
**Learned from.** `providers/google/shared/batch.ts:229-234`; `core/utils/redis-rate-limiter.ts`;
`providers/outlook/shared/throttle.ts`.
**Honoured by.** `Capabilities.quotaScope` (`perUser | perMailbox | perCollection`) and
`Capabilities.throttleSignals` (`{ status, hasRetryAfter }[]`) are declarative data, so the engine picks a
limiter key with no provider-specific branch. Rate limiting itself is out of scope (see 52).

### 24. Storage bounds and mirror bounds are different windows

**Lesson.** ICS storage is deliberately unbounded; filtering the feed by the sync window would make the
snapshot diff delete every historic event's stored state on the next ingest.
**Learned from.** `ics/utils/fetch-adapter.ts:388-393`; test *"returns events far outside the sync window
so stored history stays unbounded"*.
**Honoured by.** `ListingScope.window` (requested) and `CoverageWindow` (covered) are separate fields with
different shapes. Nothing in the types encourages pre-filtering a snapshot to the requested window.

### 25. Retiring a mirror is not deleting a source event

**Lesson.** A mirror the window no longer covers stops receiving updates; the source event is retained.
Both window edges retire mappings.
**Learned from.** `core/sync/operations.ts:550-556`.
**Honoured by.** `WriteIntent` has separate `delete` (`reason: sourceDeleted | sourceUnmapped`) and
`retire` (`reason: outsideWindow | destinationDisconnected`) members.

### 26. An empty enumeration is not proof that everything was deleted

**Lesson.** Rediscovery suppresses a plan entirely when the provider returned zero calendars but rows
exist, and skips discovered calendars belonging to another account.
**Learned from.** `core/source/calendar-rediscovery.ts:149-150`; commit `877245dc` *scope provider account
identity to the owning user*.
**Honoured by.** `CalendarEnumeration` is the same shape of union: `snapshot` (authoritative) or `partial`
(retires nothing). The retire-deriving signature accepts only the `snapshot` variant. `CalendarKey` is
`{ provider, account, calendar }`, so two accounts' calendars cannot collide. The commit's actual lesson is
narrower and sharper than "add the account to the key": a *provider-issued* account id is unique only
within one Keeper user, which is why the index had to be widened to `(userId, provider, accountId)`.
`CalendarKey.account` is therefore Keeper's own account row id — already user-scoped — and never the
provider's identifier for the mailbox. That is now unforgeable rather than conventional: `AccountId` is a
tagged handle, so the provider-issued string an adapter reads off an API response is not assignable to it,
and only whoever loads the account row can mint one. **Proved by.** `change-listing.test-d.ts :: a partial calendar enumeration cannot retire calendars`; `change-listing.test-d.ts :: a calendar key is a composite that includes the owning account`.

### 27. Ordering must be decided by a stable signature, not feed order

**Lesson.** Revision ties break on the lowest slot signature; a UID whose newest revision is unbuildable
must withhold that UID entirely, because letting the superseded revision win syncs the instance to a time
the publisher already moved away from.
**Learned from.** `ics/utils/parse-ics-events.ts:156-159, 412-415`; `ics-superseded-slot-telemetry`,
`ics-stale-revision-telemetry`, `ics-revision-collapse-telemetry`.
**Honoured by.** Only the second half is honoured here. `RemoteEvent.revision` is required, so "newest
wins" is decidable from the type, and `WithholdReason` includes `supersededRevisionUnbuildable` so a UID is
suppressed rather than downgraded. The tie-break — equal revisions resolved by the lowest slot signature —
is **not** in the protocol and deliberately so: the protocol keys events by the provider's own
`RemoteEventId`, so two same-UID masters at different slots are already two distinct events and no
merge decision arises. The tie-break belongs to the ICS adapter, which is the only reader that collapses
a UID-keyed feed into events; it owns the `parse-ics-events.ts` ordering rule and the tests
*"keeps duplicate UIDs and preserves adversarial time ranges"* and *"does not merge recurring masters that
reuse a UID at different slots"*.

### 28. Our own writes come back on the next poll

**Lesson.** A destination that widened its mirror must not read as a source change.
**Learned from.** `tests/ics/degenerate-range-source-ingest.test.ts`; commit `b057d2e0`.
**Honoured by.** Same as 7, plus `Capabilities.provenanceChannel` — an adapter with no place to store a
marker must declare `"none"`, which forces `IndeterminateEvent`, which the compiler forces the consumer to
handle. The safe answer (do not echo) becomes a compiler-forced decision.

### 29. Change detection must survive key order, Date-vs-string and undefined-vs-null

**Lesson.** Otherwise every poll churns and rewrites the remote.
**Learned from.** `ics/utils/diff-events.ts` (`toStableComparableValue`); *"settles without churning the
surviving row over repeated polls"*.
**Honoured by.** `Fingerprint` is a tagged handle with a stated contract (stable under key reordering,
ISO/Date equivalence, `undefined ≡ absent`). The protocol types it and does not compute it; production
belongs to a sibling package (see 55). An `Instant` is a tagged handle over an RFC 3339 string, so a `Date`
is not assignable anywhere in the contract and the Date-vs-string comparison cannot arise.

### 30. Re-ingesting the same input twice must be no work

**Lesson.** Idempotence is tested explicitly, not assumed.
**Learned from.** `interpret-full-day-recurrence.test.ts`, `degenerate-range-source-ingest.test.ts`,
commit `a7c4be88`.
**Honoured by.** `WriteOutcome.unchanged` and `WriteOutcome.alreadyExists` make "the replay did nothing" a
typed result rather than an inferred one.

### 31. Remote I/O stays outside database transactions

**Lesson.** Telemetry emitted from inside a pooled driver's callback lands on another source's wide event.
**Learned from.** commit `1c5171d2`; `ingest.ts:191-197`.
**Honoured by.** `CalendarProvider` accepts no transaction, no database handle and no logger. Its only
ambient input is `OperationContext { signal, now, retryBudget }`. Persistence is the engine's concern.

### 32. Comments have been used to express what types should

**Lesson.** The `sync-lock` holder-prefix JSDoc is six lines explaining what a naming convention means.
**Learned from.** `packages/sync/src/sync-lock.ts`.
**Honoured by.** The package ships with zero explanatory comments. The one admissible form — an external
constraint with a citation — is reserved for provider quirks like entry 36.

### 33. A `success: boolean` is never enough

**Lesson.** Every boolean result in the existing code grew a second field within months
(`conflictResolved`, `needsReauthentication`, `fullSyncRequired`).
**Learned from.** `core/types.ts` `PushResult`, `DeleteResult`, `BroadcastSyncStatus`.
**Honoured by.** No boolean appears in any outcome or failure type — `ProviderFailure.transport` reports
`disposition: "transient" | "permanent"`, not `retryable: boolean`, so the day it needs to say
*retryable after what* it grows a member rather than a second field. Booleans survive only in
`Capabilities`, where each one is a standing declaration about a provider rather than the result of an
attempt. `Result` is a two-member union and `WriteOutcome`
has nine named members.

### 34. Graph's removal signal is ambiguous

**Lesson.** `calendarView` delta returns `@removed: { reason: "deleted" }` both for events genuinely
deleted inside the range **and** for events outside the range that were added, deleted or updated. A Graph
removal is therefore not proof of deletion.
**Learned from.** <https://learn.microsoft.com/en-us/graph/delta-query-events>.
**Honoured by.** `delta` carries `removals: readonly Removal[]` where
`Removal = { kind: "deleted"; id; uid } | { kind: "outOfScope"; id }`. Only `deleted` is assignable to the
deletion driver. Every adapter must classify — Google pays a small tax for a guard Outlook cannot live
without. `Capabilities.removalsAreAmbiguous` records which providers need the classification. **Proved by.** `deletion.test-d.ts :: an outOfScope removal never drives a deletion`; `deletion.test-d.ts :: a cancellation is deletion evidence in its own right`.

### 35. A post-410 resync carries no tombstones

**Lesson.** After `syncStateNotFound`, Graph's fresh delta cycle returns current state without tombstones
for items removed during the gap; Google's docs say the same for its 410.
**Learned from.** <https://learn.microsoft.com/en-us/graph/delta-query-overview>,
<https://developers.google.com/workspace/calendar/api/guides/sync>.
**Honoured by.** `cursorLost` carries nothing, and recovery is a `snapshot` whose removals are derivable
only within `coverage`. **Proved by.** `deletion.test-d.ts :: DeriveSnapshotRemovals rejects a cursorLost listing`.

### 36. RFC 6578 truncation is a state, not an error

**Lesson.** A truncated `sync-collection` response is 207 with 507 for the request URI and
`DAV:number-of-matches-within-limits`; it is resumed with the same sync-token. Removed members appear as a
`DAV:response` with 404 and no `DAV:propstat`.
**Learned from.** <https://www.rfc-editor.org/rfc/rfc6578.html>.
**Honoured by.** `partial` is exactly this state and carries a `Continuation`. Three independent providers
producing the same shape is the evidence that the four-member union is not over-generalisation. This is
also the archetype for the one admissible comment style: an external constraint with a citation.

### 37. Every provider has a different concurrency token

**Lesson.** Google and Graph use ETag/changeKey with `If-Match` (412 on mismatch); CalDAV uses `If-Match`
for replace and `If-None-Match: *` for create.
**Learned from.** RFC 4791, RFC 9110 §13, Graph and Google event references.
**Honoured by.** `Precondition = matchesVersion | matchesFingerprint | absent`. `absent` maps to
`If-None-Match: *` and to Google's deterministic-id create. `Capabilities.precondition` declares which
kind a provider compares against, and its type is `ObservedPrecondition["kind"]` — derived from the union
itself, so the vocabulary an adapter declares and the preconditions the engine can build are the same set
by construction. There is no separate hand-written list of kinds to drift, and no `"none"`: a provider
that compares nothing has no way to say so, because an unconditional write is the thing this entry exists
to forbid. An optional `etag?: string` is rejected for the same reason: optionality is the hole silent
overwrites arrive through.

### 38. Use provider-native idempotency

**Lesson.** Google accepts a client-supplied event id on `events.insert` and returns 409 on replay; Graph
has a write-once `transactionId`; CalDAV gets it from client-chosen paths plus `If-None-Match: *`.
**Learned from.** <https://developers.google.com/workspace/calendar/api/v3/reference/events/insert>,
<https://learn.microsoft.com/en-us/graph/api/resources/event>.
**Honoured by.** `create.idempotencyKey` is required, and `alreadyExists` is a success outcome, not an
error. The key is a tagged handle because Google's id format is constrained, so the adapter validates it.

### 39. Pagination state is not sync state

**Lesson.** Google returns `nextSyncToken` only on the final page; Graph distinguishes `@odata.nextLink`
from `@odata.deltaLink`. Confusing them silently skips changes.
**Learned from.** Google sync guide; Graph delta overview.
**Honoured by.** `SyncCursor` and `Continuation` are distinct tagged handles, mutually unassignable.
`partial` carries only a `Continuation`; `delta` carries only a `SyncCursor`. **Proved by.** `identifiers.test-d.ts :: a Continuation is not assignable to a SyncCursor and vice versa`; `change-listing.test-d.ts :: a partial listing carries neither a cursor nor a coverage window`.

### 40. A cursor is valid only for the request shape that minted it

**Lesson.** Google rejects an incremental request whose query parameters differ from the original; Graph
bakes `startDateTime`/`endDateTime` into the delta token so widening the window silently does nothing.
This directly threatens the configurable sync-window feature.
**Learned from.** Google sync guide; Graph delta-query-events.
**Honoured by.** `SyncCursor` and `Continuation` both carry a required `scope: ListingScope`. A cursor
cannot exist without the calendar and window it was minted against. The compiler cannot compare two
windows, so the engine-side rule — a widened window discards the cursor and forces a snapshot — is recorded
here as entry 53 and tested where it is implemented. **Proved by.** `change-listing.test-d.ts :: a cursor cannot exist without the scope that minted it`.

### 41. Provider representational limits must be declared, not discovered at write time

**Lesson.** Windows timezone ids, zero-duration events Google refuses, Outlook's VTIMEZONE expectations.
**Learned from.** `outlook-windows-timezone.test.ts`; commits `0111e5de`, `ac6fa18c`, `7c276d8e`,
`b057d2e0`.
**Honoured by.** `Capabilities` is a declarative record; `WriteOutcome.unrepresentable` is a typed refusal
rather than a lossy coercion. Same design element as entry 16.

### 42. Adapters must return failures, not throw them

**Lesson.** A thrown error erases the discriminated union, and reauth ends up in a generic `catch`.
**Learned from.** `core/oauth/error-classification.ts` reconstructing categories from caught errors.
**Honoured by.** Every awaiting method returns `Promise<Result<T>>`. `Result` has no `throw` variant.
**Proved by.** `provider-shape.test-d.ts :: a provider whose write resolves a bare outcome does not satisfy the contract`.

### 43. Provenance may be undetectable, and that must be sayable

**Lesson.** Google offers `extendedProperties.private`, Graph offers extensions — with current reports of
them being dropped silently. An adapter that cannot carry a marker must be able to say so.
**Learned from.** Google extended-properties guide; Graph event resource docs.
**Honoured by.** `Capabilities.provenanceChannel: "extendedProperty" | "uidSuffix" | "none"` and the
`indeterminate` provenance variant, which no write-intent builder accepts. **Proved by.** `provenance.test-d.ts :: an IndeterminateEvent is not assignable either`; `provenance.test-d.ts :: a provenance switch that omits indeterminate fails to compile`.

---

## Not applicable to this package

### 44. All-day anchoring to UTC midnight

Leaving an all-day event on a local-midnight instant, or writing a range not snapped to whole UTC days,
makes the read-back narrower than the write and the mirror is recreated every run
(`interpret-full-day-timed-events.ts`, commits `82799c5b`, `b057d2e0`).
**Not applicable.** Time-representation semantics belong to the calendar model, not the transport contract.
The protocol honours it only structurally: `EventTime` is
`{ kind: "allDay"; startDate; endDateExclusive } | { kind: "timed"; start; end; zone }`, so a DATE and a
DATE-TIME cannot be mixed and `isAllDay: boolean` beside two instants is unrepresentable. That separation
is real rather than nominal now that `Instant` and `CalendarDate` are distinct tagged handles: an RFC 3339
timestamp is not assignable to `startDate`. The anchoring
rule stays with whoever builds the events. `Capabilities.allDay` records which grid a provider expects so
the adapter, not the protocol, applies it.

### 45. DST fold and gap resolution

A wall time plus a zone does not name an instant during a fold, and RFC 5545 cannot say which pass; ts-ics
drops the time of day from a projected VTIMEZONE onset (`resolve-zoned-instants.ts`, `wall-time-*.test.ts`).
**Not applicable.** The protocol carries instants as RFC 3339 UTC strings with the zone alongside as
metadata. It never carries a bare wall time a consumer would have to resolve, so the ambiguity cannot enter
the contract. Resolution stays in `@keeper.sh/calendar`. This is a deliberate non-adoption, not an
omission.

### 46. The CalDAV BOM

`Response.text()` strips a leading UTF-8 BOM while decoding, but CalDAV `calendar-data` arrives as an XML
text node with the BOM intact, turning `BEGIN:VCALENDAR` into an unparseable property line
(`ics/utils/apply-patches.ts`).
**Not applicable.** A byte-level transport quirk with no expression in a type. Recorded because it is the
canonical example of the one admissible comment: an external constraint plus its citation.

### 47. Google's conference block

Google owns the region between its two conference delimiters and deletes its contents on write, so a
mirrored copy carrying no conference strips the region and diverges every run
(`providers/google/destination/conference-block.ts`).
**Not applicable.** A Google-adapter normalization concern. Honoured indirectly by entry 15: normalization
is a declared phase and its output is the only thing hashed and written.

### 48. Windows/CLDR timezone identifier mapping

Outlook requires Windows zone identifiers and Microsoft-shaped observances (`ac6fa18c`, `7c276d8e`).
**Not applicable.** A mapping table belonging to the Outlook adapter. The protocol carries an IANA `ZoneId`
and nothing else; `Capabilities` states the constraint exists (entry 41) without encoding the table.

### 49. Recurrence expansion and occurrence budgets

Materializing a series is expensive and bounded (`core/events/recurrence-materializer.ts`).
**Not applicable as behaviour.** The protocol carries recurrence as an opaque `RecurrencePayload`
(dialect + value + exceptions) and never expands it. Importing `rrule` or `ts-ics` here would leak a
parser's data model into the contract — exactly why today's `EventTimeSlot` cannot be reused across Google
and Graph. The budget itself surfaces only as `WithholdReason.recurrenceBudgetExceeded` (entry 4).

---

## Inherited by sibling sync-kit packages

Recorded so the review does not read their absence from a types-only package as an omission.

### 50. Single-flight coordination

The in-flight entry must be deleted in `finally`, guarded by identity so a later task is not evicted; the
losing waiter must receive the leader's failure rather than hanging; telemetry must not be written inside
the shared body, because only the joining branch runs in the joiner's async context
(`core/oauth/refresh-coordinator.ts`). **Owner:** the sync-kit coalescing package. **Required tests:**
leader throws → follower rejects; leader settles → map entry gone; concurrent calls for one key do not
interleave.

### 51. Lock and lease discipline

Locks are taken in a deterministic global order inside one transaction so a crash releases them, with both
`statement_timeout` and `idle_in_transaction_session_timeout` set; work outside the locked set supersedes
the run rather than acquiring nested locks (`core/source/ingest-lock.ts`, `packages/sync/src/sync-lock.ts`).
**Owner:** the sync-kit lease package. **Required tests:** lease released when the body throws;
deterministic acquisition order; no nested acquisition; renewal blip does not strand a run.

### 52. Rate limiting and backoff

Quota acquired inside the retried operation, `Retry-After` capped, sleeps abortable and timer-clearing
(entries 21, 23). **Owner:** the sync-kit engine. **Required tests:** provable ceiling on every retry path;
abort mid-flight rejects and cleans up; a stub that never resolves still hits a deadline. Timers use
`setTimeout` — `Bun.sleep` is native and `vi.useFakeTimers` cannot patch it, which cost this team real CI
time.

### 53. Cursor invalidation on window change

A widened sync window must discard the stored cursor and force a snapshot (entry 40). **Owner:** the
engine, because it compares the stored `ListingScope` with the requested one. The protocol makes the
comparison possible by requiring `scope` on every cursor.

### 54. Consumer-side full resync

A stored-state parse failure forces `cursorLost` from the consumer side (entry 13). **Owner:** the engine.

### 55. Fingerprint computation

RFC 8785 (JCS) is the standard answer for deterministic JSON: lexicographic key sort by UTF-16 code unit,
whitespace stripped, Ryū number normalisation. `packages/calendar` currently hand-rolls a subset in
`diff-events.ts` *and* depends on `fast-json-stable-stringify` — two implementations of one idea.
**Owner:** a single sibling package. The protocol declares the `Fingerprint` contract (entry 29) and
exports a conformance suite as types; it cannot enforce the contract at compile time and says so.

---

## Added after adversarial review

### 56. A cancelled event is not an absent event

**Lesson.** Google's incremental sync reports a deletion as an event whose `status` is `cancelled`, not as
a separate removals collection, and an ICS feed can carry a cancelled VEVENT inside an otherwise complete
body. The ICS parser turns a cancelled recurrence override into a master exception and drops a cancelled
master together with all of its detached overrides — meaning a cancellation is a first-class input to the
diff, never something to filter out.
**Learned from.** `packages/calendar/tests/ics/utils/parse-ics-events.test.ts` *"turns a cancelled
recurrence override into a master exception"*, *"drops a cancelled master and all of its detached
overrides"*; <https://developers.google.com/workspace/calendar/api/guides/sync>.
**Honoured by.** `Removal` has a third member, `{ kind: "cancelled"; id; uid }`, and both authoritative
listing kinds — `snapshot` as well as `delta` — carry a required `removals`. Before this, a snapshot
containing a cancelled event had no legal encoding: an adapter had to either publish it as a live event
(mirroring a cancellation forever) or filter it out, which entry 4 identifies as the direct cause of a
wrongful deletion. `AuthoritativeRemoval = deleted | cancelled` is what drives a deletion; `outOfScope`
still drives nothing.
**Proved by.** `deletion.test-d.ts :: a cancellation is deletion evidence in its own right`;
`change-listing.test-d.ts :: a cancelled event has somewhere to go in both authoritative listing kinds`.

### 57. A recurring master is wall time plus a zone, and its duration may be nominal

**Lesson.** RFC 5545 durations in weeks and days are *nominal* — added in wall time and re-resolved
through the zone, so a "one day" occurrence is 23 or 25 hours across a DST transition — while hours,
minutes and seconds are exact. A master pinned to two absolute instants with an optional zone cannot be
expanded correctly, and an exact 24-hour duration is indistinguishable from a nominal one-day duration.
**Learned from.** `packages/calendar/src/ics/utils/recurrence-duration.ts`; `parse-ics-events.test.ts`
*"distinguishes exact DTEND duration from nominal DURATION"*; the `wall-time-*` sweeps;
`build-vtimezone.test.ts` *"does not let an old event truncate timezone rules for current and future
events"*.
**Honoured by.** `EditableContent` is a union rather than a record with a nullable `recurrence`. A
recurring event carries a `RecurrenceAnchor` and no `time`; its timed variant requires a non-null `zone`
and an explicit `OccurrenceDuration` (`exact` seconds or `nominal` days), and its all-day variant admits
only a nominal duration. A one-off event carries `time` and no anchor. Entry 45 keeps wall-time
*resolution* out of the protocol; this entry keeps the wall time and zone *in* it, because for a master
they are the payload rather than a derived view.
**Proved by.** `content-time.test-d.ts :: a series cannot be pinned to instants alone`;
`content-time.test-d.ts :: a timed series anchor cannot omit its zone`;
`content-time.test-d.ts :: a nominal duration is not an exact one`.

### 58. A discarded event may be missing the very identifier you would log it by

**Lesson.** Feed publishers strip DTSTART, and sometimes UID, from an event immediately before deleting
it, so the discard telemetry has to count events that cannot be named the usual way.
**Learned from.** `packages/calendar/tests/ics/utils/ics-discard-telemetry.test.ts` *"counts an event the
feed publisher stripped DTSTART from before deleting it"*, *"counts an event the feed publisher stripped
UID from before deleting it"*.
**Honoured by.** `WithheldEvent`'s identity is a union: UID present with the provider id optional, or the
provider id present with the UID explicitly null. Neither is individually required and neither may be
absent at once, so a UID-less discard is constructible and an unidentifiable one is not — an adapter is
never forced into the silent drop of entry 4. `withholdReasons` gains `missingIdentity` and
`unsupportedRecurrenceRange`, the latter for the THISANDFUTURE case entry 5 cites in its own lesson text
but had no reason code for.
**Proved by.** `diagnostics.test-d.ts :: a publisher that stripped the UID before deleting still has a
withheld shape`; `diagnostics.test-d.ts :: a recurrence range an adapter refuses to reinterpret is a named
reason`.

### 59. Discovered access must survive to the write

**Lesson.** Enumeration learns whether a calendar is writable and the fact was then discarded; a write to
a read-only calendar is expressible everywhere downstream.
**Learned from.** Adversarial review of this package's own first draft, where `CalendarRef.access` was
carried through enumeration and then had no consumer; the same shape as entry 26's "discovered, then
discarded" family. No prior commit is cited because the existing engine never attempts a write to a
calendar it enumerated as read-only — the protocol should not be the first place that becomes possible.
**Honoured by.** Every `WriteIntent` variant takes a `WritableCalendar` (`{ key, access: "readWrite" }`),
not a bare `CalendarKey`. Constructing one from a `CalendarRef` requires narrowing `access`, which is a
guard the compiler forces rather than an assertion the author may skip — the package contains no type
assertions, so there is no other way to obtain one.
**Proved by.** `write-intent.test-d.ts :: a calendar we only ever read cannot be written to`.

### 60. Lenient parsing and property-level repair

Publishers ship all-day events without `VALUE=DATE`, EXDATE lists without it, folded property lines, and
8-digit strings that are not real dates; the parser repairs conservatively, leaves compliant feeds
byte-identical, and rejects what it cannot repair
(`ics/utils/lenient-parser.ts`, `ics/utils/apply-patches.ts`, the `coerce-compliant-date` patch).
**Not applicable.** Repair happens strictly below the contract: it is how an adapter turns bytes into a
`RemoteEvent` at all. The protocol's only surface for the outcome is `WithholdReason.unparseable` — what
could not be repaired is withheld, never filtered (entry 4) and never thrown (entry 42). Encoding the
repair rules here would pull one publisher's malformations into every provider's contract, the same
mistake as entry 49.

---
---

# sync-ical learnings ledger

`@keeper.sh/sync-ical` at `packages/sync-kit/ical`: RFC 5545 parsing, canonical projection and hashing.

Entry 60 of the protocol ledger above says lenient parsing happens "strictly below the contract". This is
that place, and this is its ledger. Numbering is prefixed `I` so sibling packages can append without
renumbering anyone. Every entry states the lesson, where it was learned, and the module plus the named test
that honours it — or NOT APPLICABLE with the reason.

`ICAL-I1` through `ICAL-I45` are adopted. `ICAL-I46` through `ICAL-I52` are not applicable and say why.
`ICAL-I53` through `ICAL-I60` are the dependency and process decisions, recorded because "what we rejected"
is a learning that is otherwise lost the moment the branch merges.

## Module map referenced below

```
src/text/       bytes → content lines: bom, fold (75 octets), property-line, component-walk, patch, patches/*
src/zone/       identifiers, offsets, wall time, transitions, VTIMEZONE read + synthesis, zone-cache
src/parse/      document → per-VEVENT outcomes: identity, revision order, duration, end-time, floating,
                cancellation, recurrence-support, self-authored, diagnostics
src/canonical/  projection + encoding + hashing + the one window predicate
src/listing/    feed → protocol ChangeListing (snapshot only), present vs usable
src/serialise/  canonical → one VCALENDAR resource per recurrence set
```

## Adopted

### ICAL-I1. An unreadable body is not an empty calendar

**Lesson.** A failed fetch, an unreadable body and a body that never opened a `VCALENDAR` all parsed to zero
events, and the snapshot diff read zero events as "the user deleted everything".
**Learned from.** commit `0184ea19` *fix(ics): don't wipe existing events when remote fetch fails (#383)*;
`ics/utils/parse-ics-calendar.ts`; `ics/utils/fetch-adapter.ts`.
**Honoured by.** `src/parse/parse-calendar.ts` returns `IcsDocument = readable | unreadable`, and
`unreadable` carries no events field at all. `src/listing/project-feed.ts` maps `unreadable` to
`Result.ok === false` (`ProviderFailure.transport`), never to a listing. The only `ChangeListing` this
package can build is `snapshot`, and it is built only from `readable`.
**Proved by.** `tests/listing/no-wipe.test.ts :: a body with no BEGIN:VCALENDAR never produces a listing`;
`:: an empty body is unreadable, not an empty snapshot`;
`:: a well-formed VCALENDAR with zero VEVENTs is an authoritative empty snapshot` (the counter-test that
keeps the guard from being over-broad).

### ICAL-I2. Per-VEVENT parsing is total

**Lesson.** An all-day `DURATION` expressed in hours, a negative `DURATION` and a `THISANDFUTURE` override
each threw out of the whole parse, so ingest failed before the diff and the feed never converged. On CalDAV
every `href` is merged into one calendar first, so one bad resource took the user's whole collection.
**Learned from.** commit `fdd9ba62` (#634); `parse-ics-events.ts` `resolveEventEndTime`
("Total by design: throwing here would drop the whole calendar, not the one VEVENT").
**Honoured by.** `src/parse/parse-vevent.ts` returns
`VeventOutcome = parsed | withheld | selfAuthored`. It has no throw path. Only
`src/parse/parse-calendar.ts` refuses, and only for a structurally unreadable document (I1).
**Proved by.** `tests/parse/per-vevent-isolation.test.ts :: a negative DURATION costs exactly one event`;
`:: an hour-based DURATION on an all-day VEVENT costs exactly one event`;
`:: a THISANDFUTURE override costs exactly one event`.

### ICAL-I3. Present and usable are different sets

**Lesson.** Every data-loss incident here had one shape: something excluded from writes was also excluded
from presence, so the snapshot diff read it as deleted and destroyed the stored row.
**Learned from.** `ics/utils/fetch-adapter.ts` `unsupportedEventUids`; tests *"never deletes the stored row
of the event it withholds"*, *"applies a real deletion arriving in the same feed"*.
**Honoured by.** `IcsFeedProjection` carries `present: readonly EventIdentity[]` and
`usable: readonly EventIdentity[]` as separate fields, and the protocol's `snapshot.withheld` is populated
from `present \ usable`. `src/listing/presence.ts` is the only module that computes either.
**Proved by.** `tests/listing/withheld-is-present.test.ts :: a withheld event is present and is not deleted`;
`:: a real deletion in the same feed is still applied`.

### ICAL-I4. Every drop needs a counter, and self-authored is not unrepresentable

**Lesson.** A dropped VEVENT reads downstream as a deletion. Folding Keeper's own mirrors into the
unrepresentable counter left it permanently non-zero on mirrored calendars, so it stopped meaning anything.
**Learned from.** commit `fdd9ba62`; `parse-ics-events.ts` `countDiscardedIcsEvents`;
`ics-discard-telemetry.test.ts`.
**Honoured by.** `src/parse/diagnostics.ts` builds the protocol's `ListingDiagnostics` with `withheld`,
`selfAuthored` and `unrepresentable` as three separate `BoundedSample`s.
**Proved by.** `tests/parse/diagnostics.test.ts :: a mirrored feed reports zero unrepresentable events`.

### ICAL-I5. Diagnostics are per-identity and idempotent across polls

**Lesson.** Counting per-VEVENT rather than per-identity made a stable feed report a different number every
run and churned the surviving stored row. This regression has been fixed at least three times.
**Learned from.** tests *"keeps reporting the discard on every later run and never churns the row"*,
*"converges over repeated polls of the same malformed feed"*.
**Honoured by.** Every counter in `src/parse/diagnostics.ts` is a `Set` keyed on
`eventIdentityKey(identity)`, net of identities that still produced a canonical event.
**Proved by.** `tests/parse/idempotent-diagnostics.test.ts :: the same malformed feed reports identical
diagnostics on the second poll`; `:: the second poll produces an empty diff`.

### ICAL-I6. Duplicate-UID collision is resolved by a deterministic total order, never by feed order

**Lesson.** An unordered publisher deleted and re-created the stored row on every poll. Revision order is
SEQUENCE, then LAST-MODIFIED, then DTSTAMP, then CREATED, tie-broken on the lowest slot signature.
**Learned from.** `parse-ics-events.ts` `selectGroupRevision` / `isNewerEventRevision`;
`ics-revision-collapse-telemetry`.
**Honoured by.** `src/parse/revision-order.ts` exports `compareEventRevisions`, a pure total-order
comparator whose final tiebreak is the canonical fingerprint itself, so even equal-SEQUENCE,
equal-timestamp duplicates order deterministically. `src/parse/select-revision.ts` is order-independent by
construction (a fold over a comparator, not a scan).
**Proved by.** `tests/parse/revision-order.test.ts :: every permutation of a colliding pair selects the same
survivor`; `:: reordering the feed does not churn the projection`.

### ICAL-I7. An unbuildable NEWEST revision withholds its whole UID

**Lesson.** Dropping the unbuildable newest revision let the superseded one win, so the event synced at the
time the publisher had already moved it away from — silently, with no counter.
**Learned from.** commit `fdd9ba62`; `parse-ics-events.ts` `collectStaleRevisions` (line 413).
**Honoured by.** `src/parse/select-revision.ts` collects unbuildable candidates *before* selection and
compares them against the winner; a newer unbuildable candidate yields
`{ kind: "withheld", reason: "supersededRevisionUnbuildable" }` (the protocol's own reason code) for the
whole identity.
**Proved by.** `tests/parse/stale-revision.test.ts :: a negative-duration revision superseding a buildable
one withholds the UID`; `:: the stored row is left untouched rather than reverted`.

### ICAL-I8. Identity has three shapes and none of them is the bare UID

**Lesson.** Publishers reuse one UID for genuinely distinct events at different slots. Unversioned events
key on `uid|slot|start|end`, versioned masters on `uid|master`, overrides on `uid|<RECURRENCE-ID instant>`.
A later versioned master supersedes unversioned slots but must not resurrect them.
**Learned from.** `parse-ics-events.ts` `buildEventRevisionIdentity` / `survivesAuthoritativeMaster`; tests
*"does not merge recurring masters that reuse a UID at different slots"*, *"does not resurrect an
unversioned slot beside a later versioned restore"*.
**Honoured by.** `src/parse/identity.ts` exports `EventIdentity` as a three-member discriminated union with
an `as const` kind. The current code sniffs `identity?.includes("|slot|")`; nothing in this package parses a
key string to learn what an identity is.
**Proved by.** `tests/parse/identity.test.ts :: an unversioned slot and a versioned master are different
identities`; `:: a later versioned master does not resurrect an unversioned slot`.

### ICAL-I9. STATUS:CANCELLED is a first-class input, not a filter

**Lesson.** A cancelled master drops the master and all detached overrides; a cancelled `RECURRENCE-ID`
override must become a master `EXDATE`, or RRULE expansion resurrects the occurrence. A newer revision can
un-cancel.
**Learned from.** `parse-ics-events.ts` `collectCancellationState` / `mergeExceptionDates`; protocol ledger
entry 56.
**Honoured by.** `src/parse/cancellation.ts` is a named pass over the selected revisions producing an
explicit `cancellations` value that `src/canonical/project.ts` consumes; cancellations reach the protocol
listing as `Removal { kind: "cancelled" }`, never as a filtered-out event.
**Proved by.** `tests/parse/cancellation.test.ts :: a cancelled override becomes a master exception`;
`:: a cancelled master drops its detached overrides`; `:: a newer revision un-cancels`.

### ICAL-I10. THISANDFUTURE is reported, not reinterpreted

**Lesson.** Applying `RANGE=THISANDFUTURE` as a single-instance override silently changes the meaning of the
series; throwing fails the feed.
**Learned from.** `parse-ics-events.ts` `collectRangedOverrideEvents`.
**Honoured by.** `src/parse/recurrence-support.ts` yields the protocol's
`WithholdReason "unsupportedRecurrenceRange"` for that UID only.
**Proved by.** `tests/parse/unsupported-recurrence.test.ts :: THISANDFUTURE is unsupported, not
reinterpreted`; `:: the other events in the same feed still parse`; `:: the withheld UID is not deleted`.

### ICAL-I11. RDATE must be attributed to the VEVENT that declared it

**Lesson.** A naive line scan leaks an `RDATE` onto the next adjacent event, withholding the wrong UID. A
mismatched `BEGIN`/`END` can hide an event-level `RDATE` inside what looks like a `VTIMEZONE`.
**Learned from.** `ics/utils/validate-recurrence-input.ts`; tests *"does not leak RDATE onto the next event
when components are adjacent"*, *"fails closed when a mismatched component boundary tries to hide event
RDATE"*.
**Honoured by.** `src/text/component-walk.ts` carries a `componentInstancePath` (a unique id per component
*occurrence*) beside the component path, because two sibling VEVENTs share a path. A boundary mismatch is
`unreadable/componentBoundaryMismatch` — it fails closed.
**Proved by.** `tests/text/component-walk.test.ts :: an RDATE does not leak onto the next adjacent event`;
`:: a mismatched component boundary fails closed`.

### ICAL-I12. Identifier lists in diagnostics are a capped sample beside an uncapped count

**Lesson.** A feed publishing `RDATE` on every event produced an unsupported-uid list too large to log,
taking the counters with it.
**Learned from.** test *"keeps the unsupported-uid field loggable when a feed publishes RDATE everywhere"*.
**Honoured by.** The protocol's `BoundedSample` is the only shape any list takes; the cap is
`IcsLimits.maxDiagnosticSample`, a named field on an explicitly-passed limits record.
**Proved by.** `tests/parse/diagnostics-bounds.test.ts :: the sample stops at the cap and the total does
not` (asserted at the boundary, not inside it).

### ICAL-I13. Unfold before parsing; re-emit untouched lines byte-for-byte; emit CRLF

**Lesson.** Parsing a folded property line reads a truncated value. Rewriting every line churns the content
hash even when nothing changed. RFC 5545 §3.1 mandates CRLF terminators.
**Learned from.** `ics/utils/apply-patches.ts`; tests *"unfolds RFC 5545 line continuations before parsing
the property line"*, *"preserves the folded form of properties no patch modifies"*, *"accepts LF line
endings and emits CRLF"*.
**Honoured by.** `src/text/patch.ts` groups continuations, unfolds, offers the group to each patch, and
emits the **original** raw lines unless a patch actually changed the params or the value.
**Proved by.** `tests/text/patch.test.ts :: an untouched folded property is byte-identical after the patch
pass`; `:: LF input yields CRLF output`.

### ICAL-I14. Folding is measured in UTF-8 octets, not characters

**Lesson.** RFC 5545 §3.1 folds at 75 **octets** and warns explicitly that naive implementations split a
multi-octet sequence. `String.length` folds emoji in half and produces a body that reparses to different
text — a hash change with no semantic change.
**Learned from.** RFC 5545 §3.1; the existing unfolder is octet-agnostic because it never re-folds.
**Honoured by.** `src/text/fold.ts` measures with `TextEncoder` and never splits a code point.
**Proved by.** `tests/text/fold.test.ts :: unfold(fold(x)) === x for astral-plane and combining-mark
strings`; `:: no folded line exceeds 75 octets`; `:: a multi-octet sequence is never split`.

### ICAL-I15. Strip the UTF-8 BOM explicitly

**Lesson.** Only the ICS-over-HTTP path is accidentally BOM-safe (`Response.text()` drops it). CalDAV
`calendar-data` arrives as an XML text node with the BOM intact, turning `BEGIN:VCALENDAR` into an
unparseable property line and failing the whole resource.
**Learned from.** `apply-patches.ts` `stripIcsByteOrderMark`; commit `2657805b` (#604).
**Honoured by.** `src/text/byte-order-mark.ts`, called at the very front of `parseIcsDocument`.
**Proved by.** `tests/text/bom.test.ts :: a BOM-prefixed body from a non-HTTP transport still parses`.

### ICAL-I16. Bare 8-digit dates are coerced, with three guards

**Lesson.** Real feeds emit `DTSTART:20260515` with no `VALUE=DATE`. The coercion must fire only when the
property has no parameters (never overwriting a TZID), must reject digit strings that are not real calendar
dates (`20261301`, `20260230` — `Date.UTC` rolls them into a plausible phantom event on the wrong day), and
must handle `EXDATE`'s comma-separated list, refusing mixed lists.
**Learned from.** `ics/patches/coerce-compliant-date.ts`; commit `62d6e8fa` (#392).
**Honoured by.** `src/text/patches/coerce-compliant-date.ts`, ported with all three guards and the
round-trip real-date reconstruction check.
**Proved by.** `tests/text/patches/coerce-compliant-date.test.ts :: rejects 8-digit strings whose components
do not form a real calendar date`; `:: refuses a mixed list where any token is not a bare date`;
`:: never rewrites a property that carries a TZID`.

### ICAL-I17. Windows timezone identifiers map to IANA from the full CLDR table

**Lesson.** Microsoft/Exchange emit `Eastern Standard Time`; Google rejects non-IANA TZIDs outright. A
partial map was shipped first and had to be completed.
**Learned from.** commits `7c276d8e` (#242) then `ac6fa18c` (#244); `normalize-timezone.ts`;
`outlook-windows-timezone.test.ts`.
**Honoured by.** `src/zone/windows-zones.ts` is an `as const` record with a derived union type, applied as
the first rung of resolution at every zone entry point.
**Proved by.** `tests/zone/windows-zones.test.ts :: a Windows identifier never survives into the canonical
projection`; `:: every mapped IANA name is known to Intl.supportedValuesOf("timeZone")` — the tzdb-rename
tripwire, because the current table still carries backward links (`Asia/Calcutta`, `Europe/Kiev`,
`America/Godthab`).

### ICAL-I18. Zone resolution is a documented ladder that ends in a refusal

**Lesson.** Feeds legitimately name TZIDs Intl has never heard of: Thunderbird's
`/mozilla.org/<ver>/America/Denver`, Exchange's `Customized Time Zone`. The zone info is in the file —
recover it. But a VTIMEZONE *with* DST transitions must never be flattened onto a fixed offset: half the
year would be an hour wrong, which is worse than reporting the event unsupported.
**Learned from.** `resolve-timezone-identifier.ts`; commit `43292a9f` (#606).
**Honoured by.** `src/zone/resolve-zone-identifier.ts` returns
`ZoneResolution = resolved(via: rung) | unsupported(reason)`, with the rungs as an `as const` tuple:
`ianaDirect`, `windowsCldr`, `embeddedIanaSegment`, `declaredFixedOffset`. `Etc/GMT±N` sign inversion is the
one place an admissible comment cites its source (POSIX sign convention, tzdata `etcetera`).
**Proved by.** `tests/zone/resolve-identifier.test.ts` — one named test per rung, plus
`:: refuses to flatten a VTIMEZONE that changes offset`.

### ICAL-I19. Where the platform knows the zone, IANA rules decide the instant

**Lesson.** The single most important correctness rule in the package. ts-ics projects a VTIMEZONE
observance carrying an RRULE by expanding the rule and **drops the time of day from the onset** — every
projected transition applies from local midnight instead of the observance DTSTART hour. A wall time in the
hours before a transition lands on the wrong side. Because Keeper reads its own CalDAV writes back, the
mirrored event looked moved and was deleted and re-created every run, forever.
**Learned from.** `resolve-zoned-instants.ts` header; commit `b057d2e0`.
**Honoured by.** `src/zone/authority.ts`: where the TZID names a zone the platform knows **and** the
declared VTIMEZONE uses a projected (RRULE) observance, IANA decides. A VTIMEZONE with no RRULE states every
onset outright and stays authoritative, as RFC 5545 §3.6.5 intends.
**Proved by.** its own file, `tests/zone/observance-authority.test.ts :: keeps a wall time in the hour before
a projected transition on the standard side`; `:: keeps an explicit observance set with no projection
authoritative`.

### ICAL-I20. Wall-time resolution has exactly three cases, and each has a fixed rule

**Lesson.** Unique is trivial; a **fold** chooses the EARLIER instant; a **gap** shifts forward by the size
of the transition. Anything else throws. Both fold and gap are arbitrary choices — unpinned, the hash flaps.
**Learned from.** `timezone-instant.ts` `wallTimeToInstant`; `zoned-instant-resolution.test.ts`.
**Honoured by.** `src/zone/wall-time.ts` returns
`WallTimeResolution = unique | fold | gap`, so which branch fired is data and a hash change is
attributable — not a `Date` whose provenance is lost.
**Proved by.** `tests/zone/wall-time-policy.test.ts :: a fold resolves to the earlier instant`;
`:: a gap shifts forward by the transition size`; `:: the branch that fired is reported`.

### ICAL-I21. The two-probe premise is falsifiable, and it is tested

**Lesson.** Resolution uses the offsets one day before and one day after because no IANA zone transitions
twice within two days. That premise is asserted, not assumed. The two-probe form replaced a 13-sample sweep
costing ~19µs per DTSTART with one costing ~2.8µs, verified against the sweep over 415k wall times spanning
every transition of all 445 IANA zones 2015–2032 plus the ragged historical half of tzdata back to 1925.
**Learned from.** commit `b057d2e0`; `wall-time-bracket-premise.test.ts`, `wall-time-zone-sweep-*`.
**Honoured by.** `src/zone/wall-time.ts` keeps the two-probe form. The premise ships as an executable
specification.
**Proved by.** `tests/zone/sweeps/bracket-premise.test.ts :: no zone changes offset twice within two days`
— one test per file (see ICAL-I44).

### ICAL-I22. Offsets are whole minutes, and the emitter cannot say otherwise

**Lesson.** Offsets are not always whole hours, and historically not always whole minutes (LMT). RFC 5545's
common `UTC-OFFSET` form cannot express seconds.
**Learned from.** `wall-time-zone-sweep-whole-minute-offsets.test.ts`,
`wall-time-historical-differential.test.ts`.
**Honoured by.** `src/zone/offset.ts` `formatUtcOffset` emits `±HHMM`; a sub-minute offset is a typed
refusal (`ZoneRefusal "subMinuteOffset"`), never a silent truncation.
**Proved by.** `tests/zone/sweeps/whole-minute-offsets.test.ts :: every resolved instant reports a
whole-minute offset`; `tests/zone/offset.test.ts :: a sub-minute offset is refused, not truncated`.

### ICAL-I23. DURATION has nominal units and exact units

**Lesson.** Weeks and days are NOMINAL — walk the wall clock, so they survive a DST transition as the same
local time. Hours, minutes and seconds are EXACT. Adding `P1D` as 86_400_000 ms across a DST boundary lands
an hour off, and an exact 24-hour duration is not the same value as a nominal one-day duration.
**Learned from.** `recurrence-duration.ts` `addIcsDuration`; test *"distinguishes exact DTEND duration from
nominal DURATION"*.
**Honoured by.** `src/parse/duration.ts` splits the two and routes the nominal part through wall-clock
conversion in the event's zone. The protocol's `OccurrenceDuration = exact | nominal` carries the
distinction into the canonical form, so it cannot be flattened downstream.
**Proved by.** `tests/parse/duration.test.ts :: a nominal P1D spanning a spring-forward boundary stays at
the same wall time`; `:: an exact PT24H does not`.

### ICAL-I24. RFC 5545 §3.6.1 end-time defaults, and unbuildable means dropped-and-counted

**Lesson.** A DATE-valued DTSTART with no DTEND/DURATION ends one day later; a timed DTSTART with no DTEND
ends AT its DTSTART — a zero-duration event is legal source data, not corruption. An all-day event with an
hour-based DURATION, and any negative DURATION, are unbuildable.
**Learned from.** `parse-ics-events.ts` `resolveEventEndTime`; commit `b057d2e0` (#616).
**Honoured by.** `src/parse/end-time.ts` returns `EndTimeResolution = resolved | unbuildable(reason)`.
Each default is a named test citing its RFC clause in the test name rather than in a comment.
**Proved by.** `tests/parse/end-time.test.ts :: a date-only event without DTEND or DURATION ends one day
later (RFC 5545 §3.6.1)`; `:: a timed event without DTEND ends at its DTSTART`.

### ICAL-I25. Degenerate ranges are preserved, and one predicate judges every window

**Lesson.** Zero-duration and inverted ranges are legal in ICS; the range the feed states is kept. Four
diverged copies of `end > windowStart` each independently dropped such events, causing permanent add/delete
cycles.
**Learned from.** commit `b057d2e0` (#616); `core/events/time-range.ts` `overlapsTimeWindow`.
**Honoured by.** `src/canonical/window.ts` exports exactly one predicate, typed
`satisfies WindowMembership` against the protocol. The package contains no second copy. Provider-side
widening belongs to the destination packages and never feeds back into the fingerprint.
**Proved by.** `tests/canonical/window.test.ts :: a zero-duration event on the window start is inside the
window`; `tests/canonical/degenerate-range.test.ts :: the range the feed states is kept`.

### ICAL-I26. All-day is a pair of UTC midnights

**Lesson.** Every destination reads an all-day instant as UTC midnight. An all-day range not on the UTC day
grid reads back narrower than it was written, so the mirror is judged changed on every run — a delete and
re-create per event per run, forever, on all three providers. A local-midnight-to-local-midnight timed event
interpreted as all-day must be re-anchored onto UTC midnight of the *local* calendar day and must drop the
originating timezone, or expansion walks its wall clock and re-introduces DST drift.
**Learned from.** commit `82799c5b` (#602); `interpret-full-day-timed-events.ts`.
**Honoured by.** The protocol's `EventTime` already makes all-day a separate variant carrying
`CalendarDate`s and no zone, so a timezone cannot leak into an all-day fingerprint.
`src/canonical/all-day.ts` owns `resolveIsAllDay`, used identically by the hash and by any diff.
**Proved by.** `tests/canonical/all-day.test.ts :: a zone ahead of UTC anchors on the UTC midnight of its
local calendar day`; `:: a zone behind UTC does too`; `:: the originating timezone is dropped`;
`:: a non-midnight 24-hour timed event is not all-day`.

### ICAL-I27. Re-anchoring moves the whole recurrence identity set together

**Lesson.** `EXDATE`, `RECURRENCE-ID` and `RRULE UNTIL` are matched by exact instant. Moving DTSTART and
leaving them behind silently un-cancels a cancelled day or detaches an override from the slot it replaces.
**Learned from.** `interpret-full-day-timed-events.ts`; tests *"keeps a cancelled day cancelled"*, *"lets a
detached instance replace the day it was moved from"*, *"stops on the day the series says it stops"*.
**Honoured by.** `src/canonical/all-day.ts` exposes one function taking the whole `RecurrenceIdentitySet`
and returning a new one; there is no exported way to move DTSTART alone. The type makes the partial move
unrepresentable rather than merely discouraged.
**Proved by.** `tests/canonical/reanchor.test.ts :: a cancelled day stays cancelled`; `:: a detached
instance still replaces the day it was moved from`; `:: UNTIL moves with the series`;
`tests/canonical/reanchor.test-d.ts :: DTSTART cannot be moved without its recurrence identities`.

### ICAL-I28. Floating values are anchored by a stated precedence, never guessed

**Lesson.** Floating `DTSTART`/`DTEND`/`EXDATE`/`RDATE`/`RECURRENCE-ID` and `RRULE UNTIL` anchor to the TZID
on the event's own DTSTART first, then `X-WR-TIMEZONE`; with no zone context at all the event is reported
unsupported. Because a TZID parameter applies to every value on a property, a mixed multi-value `EXDATE`
(some floating, some Z-suffixed) must be split across two lines rather than reinterpreting the absolute
entries. An all-day series is exempt: a DATE DTSTART makes a date-time UNTIL a date comparison anyway.
**Learned from.** commit `43292a9f` (#606); `fetch-adapter.ts` `normalizeFloatingDateProperty`.
**Honoured by.** `src/parse/floating.ts` applies one precedence function per *value*, with per-VEVENT
failure isolation — a `RangeError` inside one block is attributed to that UID and the block is emitted
unchanged, so an unanchorable event reports rather than ending the pass.
`src/text/patches/split-mixed-exdate.ts` performs the line split in the patch layer where all leniency
lives.
**Proved by.** `tests/parse/floating.test.ts :: only the floating entries of a mixed multi-value EXDATE are
resolved`; `:: a floating EXDATE with no zone context is unsupported, not guessed`; `:: an all-day series
with a date-time UNTIL is left alone`; `:: the event TZID wins over X-WR-TIMEZONE`.

### ICAL-I29. X-WR-TIMEZONE never overrides an explicit TZID

**Lesson.** Parsers that let the calendar-level `X-WR-TIMEZONE` win over a VTIMEZONE-qualified value put
every event an hour early for half the year. This is the most commonly reported iCalendar parsing defect
across implementations, and it is the same class of bug as ICAL-I19.
**Learned from.** `u01jmg3/ics-parser#245` *"With X-WR-TIMEZONE set wrong time is returned"*;
`ical4j#230`; corroborated by the precedence already encoded in `fetch-adapter.ts`.
**Honoured by.** `X-WR-TIMEZONE` is the **second** rung of `src/parse/floating.ts` and applies only to
values that carry no zone of their own. It is never consulted for a TZID-qualified value.
**Proved by.** `tests/parse/floating.test.ts :: a TZID-qualified value ignores X-WR-TIMEZONE`.

### ICAL-I30. A referenced-but-undefined TZID gets a synthesised VTIMEZONE

**Lesson.** Without one, ts-ics falls back to reading the wall-clock value as if it were the UTC instant —
wrong on the wrong side of every DST transition. The synthesised block must keep the identifier the
properties actually reference (a Windows name included), or nothing links to it.
**Learned from.** `synthesize-vtimezones.ts`; commit `2657805b` (#604).
**Honoured by.** `src/zone/synthesize-vtimezones.ts` runs before the strict parse; the generated observances
describe the *resolved* IANA zone while the emitted `TZID` is the *referenced* string.
**Proved by.** `tests/zone/synthesize.test.ts :: a Windows-named TZID with no VTIMEZONE is synthesised under
the referenced identifier`.

### ICAL-I31. VTIMEZONE synthesis is validate-then-emit, and its cache is passed in

**Lesson.** An annual RRULE is emitted only after validating that the full projection (reference year − 1
through max(reference, current) + 100) groups into exactly two stable patterns occurring in every year.
Africa/Casablanca's moving Ramadan transitions must fall back to explicit per-transition observances. A
baseline STANDARD observance is always emitted (commit `cecd4024` exists because it was once dropped). A
projection keyed on an old event must not truncate rules for current and future events. Southern-hemisphere
direction and non-hour transition sizes (Lord Howe's 30 minutes) must survive. Outlook needs the RRULE form
to render at all, which is the only reason to attempt it.
**Learned from.** `build-vtimezone.ts`; commits `cecd4024` (#420), `0111e5de` (#423).
**Honoured by.** `src/zone/build-vtimezone.ts` ports the validation gate whole. Its cache is **not**
module-level mutable state: `createZoneCache()` returns a cache the caller passes in, satisfying the
package's no-module-side-effects rule. `IcsLimits.zoneProjectionYears` bounds the projection.
**Proved by.** `tests/zone/build-vtimezone.test.ts :: does not invent a perpetual rule for Morocco's moving
Ramadan transitions`; `:: emits one baseline observance for a fixed-offset zone`; `:: an old event does not
truncate rules for current and future events`; `:: preserves non-hour transition sizes`;
`:: preserves southern-hemisphere direction`.

### ICAL-I32. The second pass of a fall-back hour is written in UTC

**Lesson.** A wall clock repeats an hour at a fall-back transition and RFC 5545 has no way to say which pass
is meant. An instant in the second pass cannot survive being written as a local time — the read-back moves
it to the first pass and the mirror churns.
**Learned from.** `build-zoned-date.ts` (round-trip check before emitting `local`).
**Honoured by.** `src/serialise/zoned-date.ts` round-trips its own output before choosing a representation:
if `resolveWallTime(instantToWallTime(x)) !== x`, it emits UTC. The choice is returned as
`ZonedDateRendering = localWithTzid | utc`, so it is inspectable rather than implied.
**Proved by.** `tests/serialise/zoned-date.test.ts :: writes the second pass of a fall-back hour in UTC`;
`:: keeps the TZID form for the first pass`; `:: round trips the hour before a spring-forward transition`.

### ICAL-I33. The content hash is computed over a canonical form, never over object key order

**Lesson.** Two structurally identical recurrence payloads with different key order produced a diff,
deleting and re-creating the event.
**Learned from.** `core/events/content-hash.ts`; `diff-events.ts` `toStableComparableValue`.
**Honoured by.** `src/canonical/encode.ts` defines the canonical form outright: a fixed field **order**
(`canonicalFieldOrder`, an `as const` tuple, so adding a field is a compile-time decision), instants as
RFC 3339 UTC, exception dates sorted and deduplicated, absent collapsed to one sentinel, text normalised
(CRLF→LF, trimmed), joined with a separator no value can contain. `src/canonical/hash.ts` hashes the UTF-8
bytes. `projectCanonicalEvent` is built through a `satisfies Record<keyof CanonicalEvent, …>` mapping, so a
new field cannot be silently omitted from the hash.
**Proved by.** `tests/canonical/hash-invariance.test.ts :: key order does not change the fingerprint`;
`:: exception-date order does not change the fingerprint`; `:: null, undefined and absent are one value`;
`:: hashing the canonical form twice is a fixed point`; and the negative control
`tests/canonical/hash-sensitivity.test.ts :: availability, zone, exception dates and recurrence each change
the fingerprint` — without which the invariance tests would pass on a constant.

### ICAL-I34. The hash excludes exactly what providers rewrite

**Lesson.** Providers normalise what we write. RFC 4791 §5.3.4 goes further: a strong ETag MUST NOT be
returned when the server rewrote the data, so an ETag round-trip cannot answer "did my write land
unchanged" — only a semantic hash can. Google and iCloud routinely rewrite DTSTAMP, SEQUENCE and property
order.
**Learned from.** RFC 4791 §5.3.4; `core/events/push-echo.ts` `isSameSerializedSecond`; commit `b057d2e0`.
**Honoured by.** The canonical projection excludes `DTSTAMP`, `SEQUENCE`, `PRODID`, `VERSION`, `CALSCALE`,
`CREATED`, `LAST-MODIFIED`, property and parameter ordering, line folding, and our own `X-` provenance
stamp. `SEQUENCE` is used for revision **ordering** (ICAL-I6) and kept out of the **content** hash; those
are two jobs and conflating them causes both echo-writes and stale-revision overwrites.
**Proved by.** `tests/canonical/provider-roundtrip.test.ts :: a simulated provider rewrite of DTSTAMP,
SEQUENCE, PRODID, CREATED, LAST-MODIFIED, property order and fold width does not change the fingerprint`;
`:: SEQUENCE still orders revisions`. This is the single most valuable test in the package.

### ICAL-I35. RFC 7986 decoration is not content

**Lesson.** `COLOR`, `IMAGE` and `CONFERENCE` (RFC 7986) are carried by some publishers and dropped by
Google's own ICS export, which stays on RFC 5545. A hash that includes them is a hash that changes when a
provider round-trips the event.
**Learned from.** RFC 7986 §5.9; Google Calendar's documented omission of COLOR from ICS export.
**Honoured by.** `canonicalFieldOrder` is a closed tuple; RFC 7986 properties are not in it. Google's
conference block remains a destination-adapter normalization concern (protocol ledger entry 47).
**Proved by.** `tests/canonical/rfc7986.test.ts :: adding COLOR, IMAGE or CONFERENCE does not change the
fingerprint`.

### ICAL-I36. Descriptions are projected to plain text exactly once

**Lesson.** A second pass reads escaped entities (`Set &lt;timeout&gt;30&lt;/timeout&gt;`) as markup and
deletes the sentence — an unrecoverable content loss on a real calendar. Deep nesting must not throw either:
a throwing projection costs the calendar its mirror.
**Learned from.** `core/events/plain-text-description.ts`.
**Honoured by.** `src/canonical/plain-text.ts` is idempotent by construction and bounded by
`IcsLimits.maxDescriptionDepth`.
**Proved by.** `tests/canonical/plain-text.test.ts :: projecting twice equals projecting once`;
`:: a depth bomb returns instead of throwing`.

### ICAL-I37. Our own events are never echoed back

**Lesson.** Keeper-authored events carry a deterministic UID suffix and must be skipped at parse and counted
separately — but they must still be *present* (ICAL-I3), or skipping them deletes them.
**Learned from.** `core/events/identity.ts`; `parse-ics-events.ts` `isKeeperEvent`.
**Honoured by.** `src/parse/self-authored.ts` is a named predicate over the `X-` stamp and the UID suffix,
taking the `InstallationId` as an argument. `SelfAuthoredPolicy = "exclude" | "includeForRoundTrip"` opens
the events only to the round-trip verification path. The provenance stamp is excluded from the fingerprint
(ICAL-I34), so a provider that strips or preserves it hashes the same either way.
**Proved by.** `tests/parse/self-authored.test.ts :: a feed of purely self-authored events yields zero
usable events and a non-zero selfAuthored count`; `:: a self-authored event is still present`;
`:: stripping the stamp does not change the fingerprint`.

### ICAL-I38. Unchanged still reparses

**Lesson.** The unchanged short-circuit must not skip projection: `fetch-adapter` deliberately reparses
unchanged snapshot content so stored-state validation can recover from a bad previous write. Otherwise a
corrupt stored row can never heal.
**Learned from.** commit `a7c4be88` (#366); `create-snapshot.ts`.
**Honoured by.** Two distinct, distinctly-named hashes: `feedContentHash(body)` over the raw bytes, and
`canonicalEventFingerprint(event)` over the projection. `freshness: "changed" | "unchanged"` is a **field on
the result**, not an early return.
**Proved by.** `tests/listing/unchanged.test.ts :: an unchanged body still yields the full projection`.

### ICAL-I39. The whole feed is retained; windowing is the caller's problem

**Lesson.** Filtering by the sync window inside the source adapter makes the snapshot diff delete the stored
state of every historic event on the next ingest, which is why the existing adapter's
`outsideSyncWindow` count is deliberately zero.
**Learned from.** `fetch-adapter.ts`; test *"returns events far outside the sync window so stored history
stays unbounded"*.
**Honoured by.** No entry point takes a sync window. The snapshot's `CoverageWindow` is built by
`coverageForWholeFeed(calendar)` and states that an ICS body is a complete statement of its collection.
**Proved by.** `tests/listing/coverage.test.ts :: a 1998 event survives parsing`; `:: the coverage window a
whole-feed snapshot proves is unbounded`.

### ICAL-I40. Recurring events are one master plus RECURRENCE-ID overrides in one resource

**Lesson.** Emitting each override as a standalone VEVENT with a fresh UID made clients render **both** the
RRULE-expanded occurrence and the override — a visible duplicate on the user's calendar. CalDAV mandates the
same thing from the other direction: RFC 4791 §4.1 requires every component sharing a UID to live in one
calendar object resource, permits only one component type plus VTIMEZONEs, and forbids `METHOD`; violations
surface as `no-uid-conflict` and `valid-calendar-object-resource`.
**Learned from.** commit `71ac9ee1` (#387); RFC 4791 §4.1.
**Honoured by.** `serialiseCalendarResource` takes a `RecurrenceSet { master, overrides }` — a *set*, not a
component — so a caller physically cannot split a series across resources or mix two UIDs. There is no
`METHOD` field anywhere in the type.
**Proved by.** `tests/serialise/resource.test.ts :: a recurrence set serialises to one master and N
overrides sharing one UID`; `:: two different UIDs cannot be serialised into one resource`;
`:: the required VTIMEZONEs are emitted and no METHOD is`.

### ICAL-I41. The fixture corpus is the canonicalisation regression net

**Lesson.** A corpus of real provider feeds (Google holidays, gov.uk, Hebcal, Meetup with VTIMEZONE+RRULE,
Outlook/Exchange Windows timezones, CalendarLabs, university feeds) is checked in, and every one is asserted
to parse **and** to produce an empty diff when re-diffed against its own parse output.
**Learned from.** `packages/fixtures/ics/*`; `ics-fixtures.test.ts`.
**Honoured by.** `@keeper.sh/fixtures` is a devDependency and the sweep is
parse → fingerprint → serialise → reparse → fingerprint, asserted equal per fixture.
**Proved by.** `tests/fixtures/roundtrip.test.ts :: parse ∘ serialise ∘ parse is a fixed point for <fixture>`
— which is also what makes a replayed create detectable as a no-op upstream.

### ICAL-I42. Internal data fails loud; feed data fails soft

**Lesson.** A stored JSON recurrence payload that failed validation fell back to `null`, silently degrading a
recurring event into a one-off VEVENT — exactly the bug the change was meant to fix. One bad row failing the
endpoint loudly is preferable to wrong output.
**Learned from.** commit `71ac9ee1` (#387) sub-commit *"throw on invalid stored ICS recurrence/exception
data"*; user memory *fail loud on internal data*.
**Honoured by.** The two policies are distinguished by the function's **input type**, not by a flag:
`parseVevent(component: VeventComponent, …)` (external, total, never throws) versus
`parseStoredCanonicalEvent(value: unknown): CanonicalEvent` (internal, throws `IcsInternalDataError`).
**Proved by.** `tests/canonical/stored-event.test.ts :: an invalid stored canonical event throws rather than
degrading to a one-off`.

### ICAL-I43. Unbounded work is this package's form of the missing ceiling

**Lesson.** The product has repeatedly shipped hangs. A pure parser cannot deadlock, but it can wedge: a
million-EXDATE VEVENT, a fold bomb, a `COUNT=2000000000` rule, a 400-year zone projection. The binary-search
transition finder is already bounded (log of the window) and must not regress to a linear scan.
**Learned from.** `timezone-instant.ts` `findTransitionInstant`; the brief's lockup obsession; commit
`1c5171d2`.
**Honoured by.** Every input-driven loop is bounded by a named field on `IcsLimits`, which arrives as an
argument. Exceeding a bound is a typed outcome — `unreadable/limitExceeded` at the document level,
`withheld/recurrenceBudgetExceeded` at the event level — never a slow success.
**Proved by.** the whole of `tests/limits/` (see the lockup list: ICAL-L2 through ICAL-L8).

### ICAL-I44. Never `Bun.sleep`, and split the sweeps one test per file

**Lesson.** `Bun.sleep` is a native primitive `vi.useFakeTimers` cannot patch; polling sleeps had to be
rewritten onto `setTimeout`. Heavy sweep suites had to be split one-test-per-file so vitest could
parallelise them.
**Learned from.** commit `e39851df` *perf(ci): cut the test critical path (#808)*; commit `34dc5079`.
**Honoured by.** No `Bun.sleep` in `src/` or `tests/`; `tests/zone/sweeps/` is one test per file from the
start; the sweeps run against a fixed adversarial zone list (Australia/Lord_Howe, Pacific/Chatham,
Asia/Kathmandu, Africa/Casablanca, America/St_Johns, Pacific/Apia, Australia/Adelaide, Antarctica/Troll)
plus a seeded sample of the full tzdb, not the whole cross-product.
**Proved by.** `tests/hygiene/no-bun-sleep.test.ts :: neither src nor tests reference Bun.sleep`;
`tests/hygiene/sweeps-are-split.test.ts :: every file under tests/zone/sweeps declares exactly one test`.

### ICAL-I45. The ambient timezone is never read

**Lesson.** `packages/calendar`'s test script pins `TZ=UTC`; without it, wall-time tests pass or fail
depending on the developer's machine. The pin should be belt-and-braces, not load-bearing.
**Learned from.** `packages/calendar/package.json`.
**Honoured by.** Every zone-sensitive function takes an explicit `ZoneId`. The test script is
`TZ=UTC bun x --bun vitest run`, and one suite re-runs the projection under a non-UTC ambient zone.
**Proved by.** `tests/hygiene/ambient-zone.test.ts :: the projection is identical under TZ=Pacific/Chatham`.

---

## Not applicable to sync-ical

### ICAL-I46. Deadlines, merged abort signals and lock release on throw

Every outbound await needs a deadline and a composed abort signal; listeners must be cleaned up when one
signal fires; `RequestTimeoutError` is distinguished from a caller abort by asking the timeout signal
itself, because both surface as the same `DOMException`
(`core/utils/fetch-with-timeout.ts`, `core/oauth/refresh-coordinator.ts`, commit `1c5171d2`).
**Not applicable.** sync-ical is pure and synchronous: it takes strings and values and returns values. It
performs no I/O, holds no lock, coalesces nothing, retries nothing and awaits nothing. Rather than invent an
async surface to satisfy the lockup brief, the guarantee is enforced structurally — no export is `async` or
returns a thenable, asserted by `ICAL-L1`. Deadlines and lease discipline belong to `sync-protocol`'s
`OperationContext` and to the sync-kit engine (protocol ledger entries 21, 50–52).
**Re-open condition.** If any streaming or incremental parse API is added here, it must take an
`AbortSignal`, must reject mid-flight, and this entry moves to Adopted. `ICAL-L1` is the tripwire that makes
that impossible to do quietly.

### ICAL-I47. Redirect ceilings and Authorization withholding

`MAX_REDIRECTS = 10`, and the `Authorization` header is withheld on a cross-origin redirect
(`utils/safe-fetch.ts`).
**Not applicable.** Transport belongs to a different sync-kit package. sync-ical parses text it is handed.
Recorded so the transport package inherits the lesson rather than rediscovering it.

### ICAL-I48. Rate limiting, backoff and quota scope

Quota acquired inside the retried operation; `Retry-After` capped; sleeps abortable.
**Not applicable.** Engine concern (protocol ledger entries 21, 23, 52). No network call exists here.

### ICAL-I49. Preconditions and typed conflicts on write

An update or delete without a precondition must be unspellable, and a stale precondition must yield a typed
conflict rather than a silent overwrite.
**Not applicable as a type here — honoured as an input.** The protocol already makes it unspellable
(`ObservedPrecondition` on `update`/`delete`/`retire`, ledger entry 9). What sync-ical owes that design is
the value `matchesFingerprint` compares: a fingerprint stable across a provider round trip (ICAL-I34). A
fingerprint that flapped would turn every conditional write into a spurious conflict, which is why
`tests/canonical/provider-roundtrip.test.ts` is listed as an overwrite test rather than a hashing test.

### ICAL-I50. Deletion authority, coverage windows and cursor semantics

RFC 6578 truncation, Google's 410, Graph's `@odata.deltaLink` versus `@odata.nextLink`, and the rule that
absence proves nothing outside a proven coverage window.
**Not applicable as behaviour.** sync-ical never sees a token and can only ever return `snapshot`. What it
must not do is offer an API that lets a caller confuse a partial read with a complete one — hence I1 and
I39, and the type test `tests/listing/listing-kind.test-d.ts :: this package cannot construct a partial or
cursorLost listing`.

### ICAL-I51. Recurrence expansion

Materializing a series is expensive and bounded.
**Not applicable.** sync-ical hashes the recurrence **rule as written** (canonicalised: uppercase parts,
fixed part order, `UNTIL` normalised to UTC `Z` per RFC 5545 §3.3.10) and never expands it. Hashing an
expansion would inherit every expander's defects and every tzdb update — the hash would change under the
product's feet on a tzdata release with no calendar having changed.

### ICAL-I52. Destination representability

Google refuses a zero-duration event; Graph refuses end-before-start; CalDAV requires a strictly later
DTEND.
**Not applicable.** The canonical hash is computed over the **source** projection only; destination-side
widening is a different package and must not feed back (ICAL-I25). The protocol carries the constraint as
`Capabilities.representableRange` and the refusal as `WriteOutcome.unrepresentable`.

---

## Dependencies taken and rejected

### ICAL-I53. Keep ts-ics for encoding; own every semantic

ts-ics (`^2.4.6`, latest as of 2026-08) is a parser/serialiser only: it does not interpret RRULE or
VTIMEZONE, which is exactly why this codebase already owns `wallTimeToInstant`, `buildVtimezone` and
`resolveCalendarZonedInstants`. It is already a dependency, TypeScript-native, and the whole patch layer
exists to compensate for its strictness in one auditable place. Any future swap must re-verify ICAL-I19,
since that bug is the reason the zoned-instant layer exists at all.

### ICAL-I54. Rejected: ical.js

The most complete implementation (libical's successor, Thunderbird's engine) and its `RecurExpansion` is
better than ours. Rejected because it brings a parallel timezone service and object model — a second source
of zone truth that can disagree with Intl, making the fingerprint depend on which path resolved the
instant — and because it would not fix ICAL-I19 while invalidating every existing patch fixture.

### ICAL-I55. Rejected: node-ical, rrule as a runtime dependency, rSchedule

node-ical bundles fetching and its own timezone handling — precisely the coupling this package exists to
avoid. rrule.js has long-standing UNTIL/DST defects (jkbrzt/rrule #65, #253, #452, #453, #480, #550:
series shifting an hour after a transition, `Invalid Date` for some zone strings) and stays confined to
`core/events/recurrence-materializer.ts` where it already lives; it never touches the hashing path.
rSchedule has a better timezone story but is effectively unmaintained and drags in luxon.

### ICAL-I56. Rejected: Temporal and temporal-polyfill

Temporal reached Stage 4 in March 2026 and ships in Chrome 144 / Firefox 139 / Node 26, but
`bun -e 'typeof Temporal'` prints `undefined` on this repo's Bun 1.3.14 — re-verified on 2026-08-15, not
taken on trust from the previous phase. The polyfill is ~50KB and ships its own view of zone rules that can
disagree with Intl. The Intl two-probe path is verified against 415k wall times and is ~7x faster than the
sweep it replaced. **Revisit only when** Bun ships Temporal natively **and** a sweep proves Temporal and
Intl name the same instant for every transition in the tzdb; `ZonedDateTime` disambiguation `"earlier"` and
`"compatible"` already match the fold and gap rules of ICAL-I20.

### ICAL-I57. Rejected: RFC 8785 (JCS) and fast-json-stable-stringify

JCS is designed for cross-language JSON interop and drags in ECMAScript number-serialisation rules this
package does not need; `packages/calendar` currently hand-rolls a subset **and** depends on
`fast-json-stable-stringify`, which is two implementations of one idea. sync-ical defines its own canonical
form instead (ICAL-I33) — a closed field-order tuple is a stronger guarantee than a key sort, because it
turns "someone added a field and forgot the hash" from a silent behaviour change into a compile error.

### ICAL-I58. Taken: Bun.CryptoHasher. Rejected: Bun.hash and crypto.subtle

`new Bun.CryptoHasher("sha256").update(x).digest("hex")` is synchronous, hardware-accelerated via BoringSSL,
already the repo idiom, and — decisively — lets every export stay synchronous, which is what makes ICAL-L1
enforceable. `crypto.subtle.digest` is Web-standard but async and would force the whole projection API into
promises for no benefit. `Bun.hash` (wyhash/xxHash3/rapidhash) is much faster but non-cryptographic and
seed/version-sensitive: a digest that changed across a Bun upgrade would re-sync every event in the product.
A test pins known digests so a runtime swap is caught rather than deployed.
**Proved by.** `tests/canonical/hash-pins.test.ts :: the fingerprint of the reference event is <digest>`.

### ICAL-I59. Rejected: fast-check

Property tests are driven by hand-rolled seeded permutations, matching the deterministic sweeps the repo
already writes. A generator library would add a devDependency and non-reproducible failures for marginal
gain over enumerating all permutations of a small feed, which is what the invariance tests actually need.

### ICAL-I60. Process

`bun install` in the worktree first. Tests run as `TZ=UTC bun x --bun vitest run` — never bare `bun test`,
which is the wrong runner and produces bogus *"vi.hoisted is not a function"* errors. turbo caches, so the
only real verdict is `bunx turbo run test lint types --force`. oxlint runs with the restriction category on:
no console, no ternaries anywhere, `eqeqeq`. No defect claim without a test that fails first — static reads
of this code have been wrong repeatedly.
