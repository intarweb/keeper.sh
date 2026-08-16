import type { CalendarEnumeration, CalendarKey } from "./calendar-ref";
import type { ChangeListing, Removal } from "./change-listing";
import type { RemoteEventId } from "./handles";
import type { CoverageWindow } from "./time";

type SnapshotListing = Extract<ChangeListing, { kind: "snapshot" }>;
type DeltaListing = Extract<ChangeListing, { kind: "delta" }>;

interface KnownEvents {
  readonly calendar: CalendarKey;
  readonly ids: ReadonlySet<string>;
}

type DeriveSnapshotRemovals = (
  listing: SnapshotListing,
  coverage: CoverageWindow,
  known: KnownEvents,
) => readonly RemoteEventId[];

type DeriveDeltaRemovals = (
  listing: DeltaListing,
) => readonly Extract<Removal, { kind: "deleted" }>[];

type DeriveCalendarRetirements = (
  enumeration: Extract<CalendarEnumeration, { kind: "snapshot" }>,
  known: readonly CalendarKey[],
) => readonly CalendarKey[];

export type {
  DeltaListing,
  DeriveCalendarRetirements,
  DeriveDeltaRemovals,
  DeriveSnapshotRemovals,
  KnownEvents,
  SnapshotListing,
};
