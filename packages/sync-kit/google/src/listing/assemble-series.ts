import type { calendar_v3 } from "@googleapis/calendar";
import { compareCodeUnits } from "../canonical";

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

const originalStartOf = (item: calendar_v3.Schema$Event): string | null => {
  const named = item.originalStartTime;
  if (!named) {
    return null;
  }
  return named.dateTime ?? named.date ?? null;
};

const seriesKeyOf = (item: calendar_v3.Schema$Event): SeriesKey | null => {
  const seriesId = item.recurringEventId;
  const originalStart = originalStartOf(item);
  if (typeof seriesId !== "string" || originalStart === null) {
    return null;
  }
  return { seriesId, originalStart };
};

const isOverride = (item: calendar_v3.Schema$Event): boolean => seriesKeyOf(item) !== null;

const overridesFor = (
  master: calendar_v3.Schema$Event,
  overrides: readonly calendar_v3.Schema$Event[],
): readonly calendar_v3.Schema$Event[] =>
  overrides
    .filter((override) => seriesKeyOf(override)?.seriesId === master.id)
    .toSorted((left, right) =>
      compareCodeUnits(originalStartOf(left) ?? "", originalStartOf(right) ?? ""),
    );

const orphansOf = (
  overrides: readonly calendar_v3.Schema$Event[],
  masters: readonly calendar_v3.Schema$Event[],
): readonly SeriesKey[] => {
  const known = new Set(masters.map((master) => master.id));
  return overrides.flatMap((override) => {
    const key = seriesKeyOf(override);
    if (key === null || known.has(key.seriesId)) {
      return [];
    }
    return [key];
  });
};

const assembleSeries = (items: readonly calendar_v3.Schema$Event[]): SeriesAssembly => {
  const overrides = items.filter((item) => isOverride(item));
  const rest = items.filter((item) => !isOverride(item));
  const masters = rest.filter((item) => (item.recurrence ?? []).length > 0);
  return {
    series: masters.map((master) => ({ master, overrides: overridesFor(master, overrides) })),
    standalone: rest.filter((item) => (item.recurrence ?? []).length === 0),
    orphanedOverrides: orphansOf(overrides, masters),
  };
};

export { assembleSeries, seriesKeyOf };
export type { AssembledSeries, SeriesAssembly, SeriesKey };
