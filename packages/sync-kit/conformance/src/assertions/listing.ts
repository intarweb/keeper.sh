import type { ChangeListing, ListingScope, RemoteEvent, Result } from "@keeper.sh/sync-protocol";
import type { CanonicalValue } from "../canonical";
import { canonicalise } from "../canonical";
import { violated } from "../violation";

const assertNotSnapshotUnderTruncation = (result: Result<ChangeListing>): void => {
  if (!result.ok) {
    return;
  }
  if (result.value.kind === "snapshot" || result.value.kind === "delta") {
    throw violated(
      "CONF-O1",
      `a truncated read answered "${result.value.kind}", which claims coverage it never proved`,
    );
  }
};

const assertCoverageProven = (listing: ChangeListing, scope: ListingScope): void => {
  if (listing.kind === "partial" || listing.kind === "cursorLost") {
    return;
  }
  if (listing.coverage.calendar.calendar.value !== scope.calendar.calendar.value) {
    throw violated(
      "CONF-O4",
      "the listing proved coverage for a calendar other than the one it was asked about",
    );
  }
};

const assertCursorWithheld = (result: Result<ChangeListing>): void => {
  if (!result.ok) {
    return;
  }
  if (result.value.cursor) {
    throw violated("CONF-O24", "a run that did not complete still returned a sync cursor");
  }
};

const identifiersOf = (event: RemoteEvent): CanonicalValue => ({
  id: event.id.value,
  uid: event.uid.value,
  deleteHandle: event.deleteHandle.value,
  version: event.version.value,
  fingerprint: event.fingerprint.value,
});

const loggableFacts = (listing: ChangeListing): CanonicalValue => ({
  kind: listing.kind,
  diagnostics: {
    withheld: [...listing.diagnostics.withheld.sample],
    selfAuthored: [...listing.diagnostics.selfAuthored.sample],
    unrepresentable: [...listing.diagnostics.unrepresentable.sample],
    pagesFetched: listing.diagnostics.pagesFetched,
  },
  events: (listing.events ?? []).map((event) => identifiersOf(event)),
  withheld: (listing.withheld ?? []).map((entry) => ({
    uid: entry.uid?.value ?? null,
    id: entry.id?.value ?? null,
    reason: entry.reason,
  })),
  removals: (listing.removals ?? []).map((removal) => ({
    kind: removal.kind,
    id: removal.id.value,
  })),
  cursor: listing.cursor?.value ?? null,
});

const assertNoContentInDiagnostics = (
  listing: ChangeListing,
  secrets: readonly string[],
): void => {
  const loggable = canonicalise(loggableFacts(listing));
  const leaked = secrets.filter((secret) => loggable.includes(secret));
  if (leaked.length > 0) {
    throw violated(
      "CONF-O19",
      `${leaked.length} content value(s) reached the loggable half of the listing`,
    );
  }
};

export {
  assertCoverageProven,
  assertCursorWithheld,
  assertNoContentInDiagnostics,
  assertNotSnapshotUnderTruncation,
};
