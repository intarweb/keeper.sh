import type {
  EditableContent,
  EventTime,
  NormalizedContent,
  RepresentabilityConstraint,
  Result,
  ZoneId,
} from "@keeper.sh/sync-protocol";
import { fingerprintOf } from "./fingerprint";

const wholeSeconds = (value: string): string =>
  new Date(Math.floor(Date.parse(value) / 1000) * 1000).toISOString();

const tidy = (value: string): string => value.replaceAll("\r\n", "\n").trimEnd();

const tidyOptional = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  return tidy(value);
};

const rewriteTime = (time: EventTime): EventTime => {
  if (time.kind === "allDay") {
    return time;
  }
  return {
    kind: "timed",
    start: { kind: "instant", value: wholeSeconds(time.start.value) },
    end: { kind: "instant", value: wholeSeconds(time.end.value) },
    zone: time.zone,
  };
};

const rewriteAsProviderWould = (content: EditableContent): EditableContent => {
  const described = {
    title: tidy(content.title),
    description: tidyOptional(content.description),
    location: tidyOptional(content.location),
    availability: content.availability,
    visibility: content.visibility,
  };
  if (content.recurrence === null) {
    return { ...described, recurrence: null, time: rewriteTime(content.time) };
  }
  return { ...described, recurrence: content.recurrence, anchor: content.anchor };
};

const isResolvableZone = (zone: ZoneId): boolean => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone.value }).resolvedOptions()
      .timeZone.length > 0;
  } catch {
    return false;
  }
};

const constraintViolatedBy = (
  content: EditableContent,
): RepresentabilityConstraint | null => {
  if (content.recurrence !== null) {
    if (content.recurrence.dialect === "rfc5545") {
      return null;
    }
    return "recurrenceDialect";
  }
  if (content.time.kind === "allDay") {
    return null;
  }
  if (content.time.zone !== null && !isResolvableZone(content.time.zone)) {
    return "zoneIdentifier";
  }
  if (Date.parse(content.time.end.value) < Date.parse(content.time.start.value)) {
    return "invertedRange";
  }
  return null;
};

const normalizeForReference = (
  content: EditableContent,
  hash: (input: string) => string,
): Result<NormalizedContent<"reference">> => {
  const constraint = constraintViolatedBy(content);
  if (constraint !== null) {
    return { ok: false, failure: { kind: "unrepresentable", constraint } };
  }
  const rewritten = rewriteAsProviderWould(content);
  return {
    ok: true,
    value: {
      kind: "normalized",
      provider: "reference",
      content: rewritten,
      fingerprint: fingerprintOf(rewritten, hash),
    },
  };
};

export { constraintViolatedBy, isResolvableZone, normalizeForReference, rewriteAsProviderWould };
