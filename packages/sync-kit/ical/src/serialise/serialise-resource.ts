import type {
  CalendarDate,
  EditableContent,
  EventUid,
  Instant,
  RepresentabilityConstraint,
  ZoneId,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { CanonicalEvent } from "../canonical/canonical-event";
import type { IcsOptions } from "../options";
import { buildVtimezone } from "../zone/build-vtimezone";
import { contentLineBreak, foldContentLine } from "../text/fold";
import { escapeTextValue } from "./escape";
import { renderZonedDate, utcText } from "./zoned-date";

interface RecurrenceSet {
  readonly master: CanonicalEvent;
  readonly overrides: readonly CanonicalEvent[];
}

type SerialisedResource =
  | { readonly kind: "resource"; readonly text: string; readonly zones: readonly ZoneId[] }
  | { readonly kind: "refused"; readonly constraint: RepresentabilityConstraint }
  | { readonly kind: "uidMismatch"; readonly master: EventUid; readonly override: EventUid };

const millisecondsInSecond = 1000;
const millisecondsInDay = 24 * 60 * 60 * millisecondsInSecond;

const dateText = (date: CalendarDate): string => date.value.replaceAll("-", "");

const shiftedDateText = (date: CalendarDate, days: number): string => {
  const shifted = new Date(Date.parse(`${date.value}T00:00:00.000Z`) + days * millisecondsInDay);
  return shifted.toISOString().slice(0, 10).replaceAll("-", "");
};

const zonesOfContent = (content: EditableContent): readonly ZoneId[] => {
  if (content.recurrence && content.anchor && content.anchor.kind === "timed") {
    return [content.anchor.zone];
  }
  if (content.time && content.time.kind === "timed" && content.time.zone) {
    return [content.time.zone];
  }
  return [];
};

const describedLines = (content: EditableContent): readonly string[] => {
  const lines = [`SUMMARY:${escapeTextValue(content.title)}`];
  if (content.description !== null) {
    lines.push(`DESCRIPTION:${escapeTextValue(content.description)}`);
  }
  if (content.location !== null) {
    lines.push(`LOCATION:${escapeTextValue(content.location)}`);
  }
  if (content.availability === "free") {
    lines.push("TRANSP:TRANSPARENT");
  }
  if (content.visibility === "private") {
    lines.push("CLASS:PRIVATE");
  }
  if (content.visibility === "public") {
    lines.push("CLASS:PUBLIC");
  }
  return lines;
};

const timedLines = (
  name: string,
  instant: Instant,
  zone: ZoneId | null,
  options: IcsOptions,
): readonly string[] => {
  if (!zone) {
    return [`${name}:${utcText(instant)}`];
  }
  return [renderZonedDate(name, instant, zone, options.zones).text];
};

const durationMilliseconds = (duration: { readonly kind: string; readonly seconds?: number; readonly days?: number }): number => {
  if (duration.kind === "exact") {
    return (duration.seconds ?? 0) * millisecondsInSecond;
  }
  return (duration.days ?? 0) * millisecondsInDay;
};

const singleOccurrenceLines = (content: EditableContent, options: IcsOptions): readonly string[] => {
  const { time } = content;
  if (!time) {
    return [];
  }
  switch (time.kind) {
    case "timed": {
      return [
        ...timedLines("DTSTART", time.start, time.zone, options),
        ...timedLines("DTEND", time.end, time.zone, options),
      ];
    }
    case "allDay": {
      return [
        `DTSTART;VALUE=DATE:${dateText(time.startDate)}`,
        `DTEND;VALUE=DATE:${dateText(time.endDateExclusive)}`,
      ];
    }
    default: {
      return assertNever(time);
    }
  }
};

const recurringLines = (content: EditableContent, options: IcsOptions): readonly string[] => {
  const { anchor, recurrence } = content;
  if (!anchor || !recurrence) {
    return [];
  }
  const rule = [`RRULE:${recurrence.value}`];
  const exceptions = recurrence.exceptions.map((value) => `EXDATE:${value}`);
  switch (anchor.kind) {
    case "timed": {
      const endMs = Date.parse(anchor.start.value) + durationMilliseconds(anchor.duration);
      return [
      ...timedLines("DTSTART", anchor.start, anchor.zone, options),
      ...timedLines("DTEND", { kind: "instant", value: new Date(endMs).toISOString() }, anchor.zone, options),
      ...rule,
      ...exceptions,
      ];
    }
    case "allDay": {
      return [
        `DTSTART;VALUE=DATE:${dateText(anchor.startDate)}`,
        `DTEND;VALUE=DATE:${shiftedDateText(anchor.startDate, anchor.duration.days)}`,
        ...rule,
        ...exceptions,
      ];
    }
    default: {
      return assertNever(anchor);
    }
  }
};


const recurrenceIdLine = (event: CanonicalEvent, options: IcsOptions): readonly string[] => {
  if (event.identity.kind !== "override") {
    return [];
  }
  return timedLines("RECURRENCE-ID", event.identity.recurrenceInstant, null, options);
};

const eventLines = (event: CanonicalEvent, uid: EventUid, options: IcsOptions): readonly string[] => [
  "BEGIN:VEVENT",
  `UID:${uid.value}`,
  "DTSTAMP:19700101T000000Z",
  ...recurrenceIdLine(event, options),
  ...describedLines(event.content),
  ...singleOccurrenceLines(event.content, options),
  ...recurringLines(event.content, options),
  "END:VEVENT",
];

const invertedRange = (content: EditableContent): boolean => {
  const { time } = content;
  if (!time || time.kind !== "timed") {
    return false;
  }
  return Date.parse(time.end.value) < Date.parse(time.start.value);
};

const mismatchedOverride = (set: RecurrenceSet): CanonicalEvent | undefined =>
  set.overrides.find((override) => override.identity.uid.value !== set.master.identity.uid.value);

const uniqueZones = (set: RecurrenceSet): readonly ZoneId[] => {
  const all = [set.master, ...set.overrides].flatMap((event) => [...zonesOfContent(event.content)]);
  const seen = new Set<string>();
  return all.filter((zone) => {
    if (seen.has(zone.value)) {
      return false;
    }
    seen.add(zone.value);
    return true;
  });
};

const serialiseCalendarResource = (set: RecurrenceSet, options: IcsOptions): SerialisedResource => {
  const mismatch = mismatchedOverride(set);
  if (mismatch) {
    return {
      kind: "uidMismatch",
      master: set.master.identity.uid,
      override: mismatch.identity.uid,
    };
  }
  if ([set.master, ...set.overrides].some((event) => invertedRange(event.content))) {
    return { kind: "refused", constraint: "invertedRange" };
  }
  const { uid } = set.master.identity;
  const zones = uniqueZones(set);
  const referenceYear = new Date(
    Date.parse(set.master.cancellations.at(0)?.value ?? "2026-01-01T00:00:00.000Z"),
  ).getUTCFullYear();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//keeper.sh//sync-ical//EN",
    ...zones.flatMap((zone) => buildVtimezone(zone, referenceYear, options).text.split(contentLineBreak)),
    ...eventLines(set.master, uid, options),
    ...set.overrides.flatMap((override) => [...eventLines(override, uid, options)]),
    "END:VCALENDAR",
  ];
  return {
    kind: "resource",
    text: lines.flatMap((line) => [...foldContentLine(line)]).map((line) => `${line}${contentLineBreak}`).join(""),
    zones,
  };
};

export { serialiseCalendarResource };
export type { RecurrenceSet, SerialisedResource };
