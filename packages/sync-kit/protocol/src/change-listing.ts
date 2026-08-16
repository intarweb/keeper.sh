import type { EventUid, RemoteEventId } from "./handles";
import type { CalendarKey } from "./calendar-ref";
import type { CoverageWindow, TimeWindow } from "./time";
import type { RemoteEvent } from "./remote-event";
import type { ListingDiagnostics, WithheldEvent } from "./diagnostics";

interface ListingScope {
  readonly calendar: CalendarKey;
  readonly window: TimeWindow;
  readonly expandRecurrences?: boolean;
}

interface SyncCursor {
  readonly kind: string;
  readonly value: string;
  readonly scope?: ListingScope;
}

interface Continuation {
  readonly kind: string;
  readonly value: string;
  readonly scope?: ListingScope;
}

interface Removal {
  readonly kind: "deleted";
  readonly id: RemoteEventId;
  readonly uid: EventUid;
}

interface LooseListing {
  readonly scope: ListingScope;
  readonly coverage?: CoverageWindow;
  readonly events?: readonly RemoteEvent[];
  readonly removals?: readonly Removal[];
  readonly withheld?: readonly WithheldEvent[];
  readonly cursor?: SyncCursor;
  readonly continuation?: Continuation;
  readonly diagnostics: ListingDiagnostics;
}

interface SnapshotListing extends LooseListing {
  readonly kind: "snapshot";
}

interface DeltaListing extends LooseListing {
  readonly kind: "delta";
}

interface PartialListing extends LooseListing {
  readonly kind: "partial";
}

interface CursorLostListing extends LooseListing {
  readonly kind: "cursorLost";
}

type ChangeListing = SnapshotListing | DeltaListing | PartialListing | CursorLostListing;

export type { ChangeListing, Continuation, ListingScope, Removal, SyncCursor };
