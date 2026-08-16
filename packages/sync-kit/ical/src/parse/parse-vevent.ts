import type {
  Availability,
  EditableContent,
  EventTime,
  EventUid,
  Instant,
  RecurrenceAnchor,
  Visibility,
  WithheldIdentity,
  WithholdReason,
  ZoneId,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { canonicalizeRecurrenceRule } from "../canonical/recurrence-rule";
import { toPlainTextDescription } from "../canonical/plain-text";
import type { IcsOptions } from "../options";
import { parameterValue } from "../text/property-line";
import type { PropertyLine } from "../text/property-line";
import { unescapeTextValue } from "../serialise/escape";
import { dateAsInstant, icsUtcOf, instantOfDateValue, resolveDateValue } from "./date-value";
import { eventZoneOf, propertyNamed, resolveEventTime } from "./event-time";
import type { EventIdentity } from "./identity";
import type { IcsDocument, VeventComponent } from "./parse-calendar";
import { isSelfAuthored } from "./self-authored";

interface EventRevision {
  readonly sequence: number | null;
  readonly lastModified: Instant | null;
  readonly stamp: Instant | null;
  readonly created: Instant | null;
}

interface ParsedVevent {
  readonly identity: EventIdentity;
  readonly content: EditableContent;
  readonly revision: EventRevision;
  readonly cancelled: boolean;
}

type VeventOutcome =
  | { readonly kind: "parsed"; readonly event: ParsedVevent }
  | { readonly kind: "withheld"; readonly identity: WithheldIdentity; readonly reason: WithholdReason }
  | { readonly kind: "selfAuthored"; readonly identity: EventIdentity };

const utcZone: ZoneId = { kind: "zoneId", value: "UTC" };
const millisecondsInSecond = 1000;

const textOf = (component: VeventComponent, name: string): string | null => {
  const property = propertyNamed(component, name);
  if (!property) {
    return null;
  }
  return unescapeTextValue(property.value);
};

const availabilityOf = (component: VeventComponent): Availability => {
  if (textOf(component, "TRANSP")?.trim().toUpperCase() === "TRANSPARENT") {
    return "free";
  }
  return "busy";
};

const visibilityOf = (component: VeventComponent): Visibility => {
  const declared = textOf(component, "CLASS")?.trim().toUpperCase();
  if (declared === "PRIVATE" || declared === "CONFIDENTIAL") {
    return "private";
  }
  if (declared === "PUBLIC") {
    return "public";
  }
  return "default";
};

const descriptionOf = (component: VeventComponent, options: IcsOptions): string | null => {
  const raw = textOf(component, "DESCRIPTION");
  if (raw === null) {
    return null;
  }
  return toPlainTextDescription(raw, options.limits);
};

const instantAtProperty = (component: VeventComponent, name: string): Instant | null => {
  const property = propertyNamed(component, name);
  if (!property) {
    return null;
  }
  const value = property.value.trim();
  if (!/^\d{8}T\d{6}Z?$/u.test(value)) {
    return null;
  }
  return {
    kind: "instant",
    value: new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
        Number(value.slice(9, 11)),
        Number(value.slice(11, 13)),
        Number(value.slice(13, 15)),
      ),
    ).toISOString(),
  };
};

const sequenceOf = (component: VeventComponent): number | null => {
  const declared = propertyNamed(component, "SEQUENCE");
  if (!declared) {
    return null;
  }
  return Number.parseInt(declared.value.trim(), 10);
};

const revisionOf = (component: VeventComponent): EventRevision => ({
  sequence: sequenceOf(component),
  lastModified: instantAtProperty(component, "LAST-MODIFIED"),
  stamp: instantAtProperty(component, "DTSTAMP"),
  created: instantAtProperty(component, "CREATED"),
});

const exceptionPropertiesOf = (component: VeventComponent): readonly string[] =>
  component.properties
    .filter((property) => property.name === "EXDATE")
    .flatMap((property) => property.value.split(","));

type ExceptionResolution =
  | { readonly kind: "resolved"; readonly exceptions: readonly string[] }
  | { readonly kind: "withheld"; readonly reason: WithholdReason };

const resolveExceptions = (
  component: VeventComponent,
  document: IcsDocument,
  options: IcsOptions,
): ExceptionResolution => {
  const eventZone = eventZoneOf(component);
  const resolved: string[] = [];
  for (const property of component.properties.filter((candidate) => candidate.name === "EXDATE")) {
    for (const entry of property.value.split(",")) {
      const value = resolveDateValue(property, entry, eventZone, document, options.zones);
      if (value.kind === "unresolved") {
        return { kind: "withheld", reason: value.reason };
      }
      const instant = instantOfDateValue(value);
      if (!instant) {
        return { kind: "withheld", reason: "unparseable" };
      }
      resolved.push(icsUtcOf(instant));
    }
  }
  return { kind: "resolved", exceptions: [...new Set(resolved)].toSorted() };
};

const anchorOf = (time: EventTime, durationSeconds: number): RecurrenceAnchor => {
  switch (time.kind) {
    case "timed": {
      return {
        kind: "timed",
        start: time.start,
        zone: time.zone ?? utcZone,
        duration: { kind: "exact", seconds: durationSeconds },
      };
    }
    case "allDay": {
      return {
        kind: "allDay",
        startDate: time.startDate,
        duration: {
          kind: "nominal",
          days: Math.round(
            (Date.parse(`${time.endDateExclusive.value}T00:00:00.000Z`) -
              Date.parse(`${time.startDate.value}T00:00:00.000Z`)) /
              (24 * 60 * 60 * millisecondsInSecond),
          ),
        },
      };
    }
    default: {
      return assertNever(time);
    }
  }
};

const spanSecondsOf = (time: EventTime): number => {
  switch (time.kind) {
    case "timed": {
      return (Date.parse(time.end.value) - Date.parse(time.start.value)) / millisecondsInSecond;
    }
    case "allDay": {
      return 0;
    }
    default: {
      return assertNever(time);
    }
  }
};

const contentOf = (
  component: VeventComponent,
  time: EventTime,
  exceptions: readonly string[],
  options: IcsOptions,
): EditableContent => {
  const described = {
    title: textOf(component, "SUMMARY") ?? "",
    description: descriptionOf(component, options),
    location: textOf(component, "LOCATION"),
    availability: availabilityOf(component),
    visibility: visibilityOf(component),
  };
  const rule = propertyNamed(component, "RRULE");
  if (!rule) {
    return { ...described, recurrence: null, time };
  }
  return {
    ...described,
    recurrence: {
      dialect: "rfc5545",
      value: canonicalizeRecurrenceRule(rule.value.trim()),
      exceptions,
    },
    anchor: anchorOf(time, spanSecondsOf(time)),
  };
};

const identityOf = (
  component: VeventComponent,
  uid: EventUid,
  time: EventTime,
  recurrenceInstant: Instant | null,
): EventIdentity => {
  if (recurrenceInstant) {
    return { kind: "override", uid, recurrenceInstant };
  }
  if (propertyNamed(component, "SEQUENCE") || propertyNamed(component, "RRULE")) {
    return { kind: "master", uid };
  }
  switch (time.kind) {
    case "timed": {
      return { kind: "slot", uid, start: time.start, end: time.end };
    }
    case "allDay": {
      return {
        kind: "slot",
        uid,
        start: dateAsInstant(time.startDate),
        end: dateAsInstant(time.endDateExclusive),
      };
    }
    default: {
      return assertNever(time);
    }
  }
};

const isThisAndFuture = (component: VeventComponent): boolean => {
  const recurrenceId = propertyNamed(component, "RECURRENCE-ID");
  if (!recurrenceId) {
    return false;
  }
  return parameterValue(recurrenceId.params, "RANGE")?.toUpperCase() === "THISANDFUTURE";
};

const recurrenceInstantOf = (
  property: PropertyLine | undefined,
  component: VeventComponent,
  document: IcsDocument,
  options: IcsOptions,
): Instant | null => {
  if (!property) {
    return null;
  }
  return instantOfDateValue(
    resolveDateValue(property, property.value, eventZoneOf(component), document, options.zones),
  );
};

const parseVevent = (
  component: VeventComponent,
  document: IcsDocument,
  options: IcsOptions,
): VeventOutcome => {
  const uidProperty = propertyNamed(component, "UID");
  const uidValue = uidProperty?.value.trim() ?? "";
  if (uidValue === "") {
    return {
      kind: "withheld",
      identity: { uid: null, id: { kind: "remoteEventId", value: `component-${component.instance}` } },
      reason: "missingIdentity",
    };
  }
  const uid: EventUid = { kind: "eventUid", value: uidValue };
  const withheldIdentity: WithheldIdentity = { uid, id: null };
  if (options.selfAuthored === "exclude" && isSelfAuthored(component, options.installation)) {
    return { kind: "selfAuthored", identity: { kind: "master", uid } };
  }
  if (isThisAndFuture(component)) {
    return { kind: "withheld", identity: withheldIdentity, reason: "unsupportedRecurrenceRange" };
  }
  if (exceptionPropertiesOf(component).length > options.limits.maxExceptionDates) {
    return { kind: "withheld", identity: withheldIdentity, reason: "recurrenceBudgetExceeded" };
  }
  const time = resolveEventTime(component, document, options);
  if (time.kind === "withheld") {
    return { kind: "withheld", identity: withheldIdentity, reason: time.reason };
  }
  const exceptions = resolveExceptions(component, document, options);
  if (exceptions.kind === "withheld") {
    return { kind: "withheld", identity: withheldIdentity, reason: exceptions.reason };
  }
  const recurrenceProperty = propertyNamed(component, "RECURRENCE-ID");
  const recurrenceInstant = recurrenceInstantOf(recurrenceProperty, component, document, options);
  if (recurrenceProperty && !recurrenceInstant) {
    return { kind: "withheld", identity: withheldIdentity, reason: "unparseable" };
  }
  return {
    kind: "parsed",
    event: {
      identity: identityOf(component, uid, time.time, recurrenceInstant),
      content: contentOf(component, time.time, exceptions.exceptions, options),
      revision: revisionOf(component),
      cancelled: textOf(component, "STATUS")?.trim().toUpperCase() === "CANCELLED",
    },
  };
};

export { parseVevent, utcZone };
export type { EventRevision, ParsedVevent, VeventOutcome };
