import type { ChangeListing, ListingScope, Result } from "@keeper.sh/sync-protocol";

const assertNotSnapshotUnderTruncation = (result: Result<ChangeListing>): void => {
  throw new Error(`unimplemented: assertNotSnapshotUnderTruncation(${result.ok})`);
};

const assertCoverageProven = (listing: ChangeListing, scope: ListingScope): void => {
  throw new Error(`unimplemented: assertCoverageProven(${listing.kind}, ${scope.calendar.provider})`);
};

const assertCursorWithheld = (result: Result<ChangeListing>): void => {
  throw new Error(`unimplemented: assertCursorWithheld(${result.ok})`);
};

const assertNoContentInDiagnostics = (
  listing: ChangeListing,
  secrets: readonly string[],
): void => {
  throw new Error(
    `unimplemented: assertNoContentInDiagnostics(${listing.kind}, ${secrets.length})`,
  );
};

export {
  assertNoContentInDiagnostics,
  assertCoverageProven,
  assertCursorWithheld,
  assertNotSnapshotUnderTruncation,
};
