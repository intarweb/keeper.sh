import type { Instant, ZoneId } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "@keeper.sh/sync-ical";
import type { DateTimeTimeZone } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

const emittableDateTime = (
  instant: Instant,
  zone: ZoneId | null,
  zones: ZoneCache,
): DateTimeTimeZone => unimplemented(instant, zone, zones);

const roundTrips = (instant: Instant, zone: ZoneId, zones: ZoneCache): boolean =>
  unimplemented(instant, zone, zones);

export { emittableDateTime, roundTrips };
