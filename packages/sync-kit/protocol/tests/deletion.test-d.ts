import { describe, expectTypeOf, test } from "vitest";
import type {
  ChangeListing,
  CoverageWindow,
  DeriveDeltaRemovals,
  DeriveSnapshotRemovals,
  KnownEvents,
  ListingDiagnostics,
  ListingScope,
  Removal,
  RemoteEvent,
  SyncCursor,
  WithheldEvent,
} from "../src/index";

declare const partialListing: Extract<ChangeListing, { kind: "partial" }>;
declare const cursorLostListing: Extract<ChangeListing, { kind: "cursorLost" }>;
declare const deltaListing: Extract<ChangeListing, { kind: "delta" }>;
declare const scope: ListingScope;
declare const coverage: CoverageWindow;
declare const events: readonly RemoteEvent[];
declare const cursor: SyncCursor;
declare const diagnostics: ListingDiagnostics;
declare const outOfScopeRemovals: readonly Extract<Removal, { kind: "outOfScope" }>[];

declare const acceptSnapshotListing: (
  listing: Parameters<DeriveSnapshotRemovals>[0],
) => void;
declare const applyDeletions: (
  removals: readonly Extract<Removal, { kind: "deleted" }>[],
) => void;

describe("deletion authority is the signature, not a runtime check", () => {
  test("DeriveSnapshotRemovals rejects a partial listing", () => {
    // @ts-expect-error an unproven read must never reach a deletion
    acceptSnapshotListing(partialListing);
  });

  test("DeriveSnapshotRemovals rejects a cursorLost listing", () => {
    // @ts-expect-error a post-410 resync names no tombstones, so it authorises no deletion
    acceptSnapshotListing(cursorLostListing);
  });

  test("a delta listing cannot express delete-everything-not-listed", () => {
    // @ts-expect-error absence in a delta feed means unchanged, never gone
    acceptSnapshotListing(deltaListing);
    expectTypeOf<Parameters<DeriveDeltaRemovals>["length"]>().toEqualTypeOf<1>();
  });

  test("DeriveSnapshotRemovals cannot be called without a coverage window", () => {
    expectTypeOf<Parameters<DeriveSnapshotRemovals>[1]>().toEqualTypeOf<CoverageWindow>();
    expectTypeOf<Parameters<DeriveSnapshotRemovals>[2]>().toEqualTypeOf<KnownEvents>();
    expectTypeOf<Parameters<DeriveSnapshotRemovals>["length"]>().toEqualTypeOf<3>();
  });

  test("an outOfScope removal never drives a deletion", () => {
    expectTypeOf<ReturnType<DeriveDeltaRemovals>>().toEqualTypeOf<
      readonly Extract<Removal, { kind: "deleted" }>[]
    >();
    // @ts-expect-error an event that merely left the window is still live on the calendar
    applyDeletions(outOfScopeRemovals);
  });

  test("withheld ids are part of the deletion-inference input", () => {
    expectTypeOf<Parameters<DeriveSnapshotRemovals>[0]["withheld"]>().toEqualTypeOf<
      readonly WithheldEvent[]
    >();
    // @ts-expect-error an adapter cannot build a listing without answering what it withheld
    acceptSnapshotListing({ kind: "snapshot", scope, coverage, events, cursor, diagnostics });
  });
});
