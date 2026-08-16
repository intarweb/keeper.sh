import type {
  EditableContent,
  EventTime,
  Instant,
  NormalizedContent,
  RecurrenceAnchor,
  RepresentabilityConstraint,
  Result,
  ZoneId,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { decodeZoneId } from "../decode/event-time";
import { fingerprintContent } from "../fingerprint";

const conferenceDelimiter = /^-::~.*::-$/;

const isDelimiter = (line: string): boolean => conferenceDelimiter.test(line);

const withoutConferenceRegion = (lines: readonly string[]): readonly string[] => {
  const opening = lines.findIndex((line) => isDelimiter(line));
  const closing = lines.findLastIndex((line) => isDelimiter(line));
  if (opening === -1 || closing === opening) {
    return lines;
  }
  return [...lines.slice(0, opening), ...lines.slice(closing + 1)];
};

const projectDescription = (description: string | null): string | null => {
  if (description === null) {
    return null;
  }
  return withoutConferenceRegion(description.split("\n")).join("\n");
};

const canonicalInstant = (instant: Instant): Instant => ({
  kind: "instant",
  value: new Date(Date.parse(instant.value)).toISOString(),
});

const shapedTime = (time: EventTime): EventTime => {
  switch (time.kind) {
    case "allDay": {
      return time;
    }
    case "timed": {
      return {
        kind: "timed",
        start: canonicalInstant(time.start),
        end: canonicalInstant(time.end),
        zone: time.zone,
      };
    }
    default: {
      return assertNever(time);
    }
  }
};

const shapedAnchor = (anchor: RecurrenceAnchor): RecurrenceAnchor => {
  switch (anchor.kind) {
    case "allDay": {
      return anchor;
    }
    case "timed": {
      return { ...anchor, start: canonicalInstant(anchor.start) };
    }
    default: {
      return assertNever(anchor);
    }
  }
};

const shapeForGoogle = (content: EditableContent): EditableContent => {
  const described = {
    title: content.title,
    description: projectDescription(content.description),
    location: content.location,
    availability: content.availability,
    visibility: content.visibility,
  };
  if (content.recurrence === null) {
    return { ...described, recurrence: null, time: shapedTime(content.time) };
  }
  return { ...described, recurrence: content.recurrence, anchor: shapedAnchor(content.anchor) };
};

const unresolvable = (zone: ZoneId | null): boolean => {
  if (zone === null) {
    return false;
  }
  return decodeZoneId(zone.value) === null;
};

const timedViolation = (
  time: Extract<EventTime, { kind: "timed" }>,
): RepresentabilityConstraint | null => {
  if (unresolvable(time.zone)) {
    return "zoneIdentifier";
  }
  const from = Date.parse(time.start.value);
  const until = Date.parse(time.end.value);
  if (until < from) {
    return "invertedRange";
  }
  if (until === from) {
    return "minimumSpan";
  }
  return null;
};

const allDayViolation = (
  time: Extract<EventTime, { kind: "allDay" }>,
): RepresentabilityConstraint | null => {
  const from = Date.parse(`${time.startDate.value}T00:00:00.000Z`);
  const until = Date.parse(`${time.endDateExclusive.value}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(until)) {
    return "allDayGrid";
  }
  if (until < from) {
    return "invertedRange";
  }
  if (until === from) {
    return "minimumSpan";
  }
  return null;
};

const occurrenceViolation = (time: EventTime): RepresentabilityConstraint | null => {
  switch (time.kind) {
    case "allDay": {
      return allDayViolation(time);
    }
    case "timed": {
      return timedViolation(time);
    }
    default: {
      return assertNever(time);
    }
  }
};

const anchorViolation = (anchor: RecurrenceAnchor): RepresentabilityConstraint | null => {
  if (anchor.kind === "allDay") {
    return null;
  }
  if (unresolvable(anchor.zone)) {
    return "zoneIdentifier";
  }
  return null;
};

const constraintViolatedBy = (content: EditableContent): RepresentabilityConstraint | null => {
  if (content.recurrence === null) {
    return occurrenceViolation(content.time);
  }
  if (content.recurrence.dialect !== "rfc5545") {
    return "recurrenceDialect";
  }
  return anchorViolation(content.anchor);
};

const normalizeForGoogle = (
  content: EditableContent,
  hash: (input: string) => string,
): Result<NormalizedContent<"google">> => {
  const constraint = constraintViolatedBy(content);
  if (constraint !== null) {
    return { ok: false, failure: { kind: "unrepresentable", constraint } };
  }
  const shaped = shapeForGoogle(content);
  return {
    ok: true,
    value: {
      kind: "normalized",
      provider: "google",
      content: shaped,
      fingerprint: fingerprintContent(shaped, hash),
    },
  };
};

export { constraintViolatedBy, normalizeForGoogle, projectDescription, shapeForGoogle };
