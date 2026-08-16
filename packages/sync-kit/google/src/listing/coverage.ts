import type { CalendarKey, CoverageWindow, TimeWindow } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const provenCoverage = (
  requested: TimeWindow,
  calendar: CalendarKey,
): CoverageWindow => unimplemented(requested, calendar);

export { provenCoverage };
