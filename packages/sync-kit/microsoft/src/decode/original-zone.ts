import type { ZoneCache } from "@keeper.sh/sync-ical";
import { unimplemented } from "../unimplemented";
import type { ZoneReading } from "./zone";

interface ZoneCandidates {
  readonly originalStartTimeZone: string | null;
  readonly responseTimeZone: string | null;
}

const resolveOriginalZone = (candidates: ZoneCandidates, zones: ZoneCache): ZoneReading =>
  unimplemented(candidates, zones);

export { resolveOriginalZone };
export type { ZoneCandidates };
