import type { CalendarKey, EventTime, EventUid, RemoteEventId } from "@keeper.sh/sync-protocol";
import type { SourceFingerprint } from "../identity/fingerprints";
import type { SourceIdentity } from "../identity/source-identity";

interface KnownEvent {
  readonly identity: SourceIdentity;
  readonly sourceFingerprint: SourceFingerprint;
  readonly time: EventTime;
  readonly recurring: boolean;
  readonly sourceCalendar: CalendarKey;
}

interface CorruptKnownRow {
  readonly id: RemoteEventId;
  readonly uid: EventUid | null;
}

interface KnownState {
  readonly calendar: CalendarKey;
  readonly events: readonly KnownEvent[];
  readonly corrupt: readonly CorruptKnownRow[];
}

export type { CorruptKnownRow, KnownEvent, KnownState };
