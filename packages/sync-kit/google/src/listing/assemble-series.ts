import type { calendar_v3 } from "@googleapis/calendar";
import { unimplemented } from "../unimplemented";

interface SeriesKey {
  readonly seriesId: string;
  readonly originalStart: string;
}

interface AssembledSeries {
  readonly master: calendar_v3.Schema$Event;
  readonly overrides: readonly calendar_v3.Schema$Event[];
}

interface SeriesAssembly {
  readonly series: readonly AssembledSeries[];
  readonly standalone: readonly calendar_v3.Schema$Event[];
  readonly orphanedOverrides: readonly SeriesKey[];
}

const assembleSeries = (
  items: readonly calendar_v3.Schema$Event[],
): SeriesAssembly => unimplemented(items);

const seriesKeyOf = (item: calendar_v3.Schema$Event): SeriesKey | null => unimplemented(item);

export { assembleSeries, seriesKeyOf };
export type { AssembledSeries, SeriesAssembly, SeriesKey };
