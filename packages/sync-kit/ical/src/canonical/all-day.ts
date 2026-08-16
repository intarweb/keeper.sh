import type { EventTime, Instant, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "../zone/zone-cache";

interface RecurrenceIdentitySet {
  readonly start: Instant;
  readonly exceptions: readonly Instant[];
  readonly overrideInstants: readonly Instant[];
  readonly until: Instant | null;
}

const resolveIsAllDay = (_time: EventTime): boolean => {
  throw new Error("unimplemented");
};

const reanchorRecurrenceIdentities = (
  _identities: RecurrenceIdentitySet,
  _zone: ZoneId,
  _zones: ZoneCache): RecurrenceIdentitySet => {
  throw new Error("unimplemented");
};

export { reanchorRecurrenceIdentities, resolveIsAllDay };
export type { RecurrenceIdentitySet };
