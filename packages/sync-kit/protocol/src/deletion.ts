import type { RemoteEventId } from "./handles";
import type { CalendarEnumeration, CalendarKey } from "./calendar-ref";
import type { ChangeListing } from "./change-listing";

type SnapshotListing = ChangeListing;
type DeltaListing = ChangeListing;

interface KnownEvents {
  readonly ids: ReadonlySet<string>;
}

type DeriveSnapshotRemovals = (
  listing: ChangeListing,
  known: KnownEvents,
) => readonly RemoteEventId[];

type DeriveDeltaRemovals = (
  listing: ChangeListing,
  known: KnownEvents,
) => readonly RemoteEventId[];

type DeriveCalendarRetirements = (
  enumeration: CalendarEnumeration,
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
