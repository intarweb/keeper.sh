import type { CalendarDate, Instant, WithholdReason, ZoneId } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { parameterValue } from "../text/property-line";
import type { PropertyLine } from "../text/property-line";
import { isIanaAuthoritative } from "../zone/authority";
import { millisecondsInMinute, padded } from "../zone/offset";
import { resolveZoneIdentifier } from "../zone/resolve-zone-identifier";
import type { DeclaredObservance, DeclaredZoneRules } from "../zone/vtimezone";
import { instantOf, resolveWallTime } from "../zone/wall-time";
import type { WallTime } from "../zone/wall-time";
import type { ZoneCache } from "../zone/zone-cache";
import type { IcsDocument } from "./parse-calendar";
import { isRealCalendarDate } from "../text/patches/coerce-compliant-date";

type DateValue =
  | { readonly kind: "instant"; readonly instant: Instant; readonly zone: ZoneId | null }
  | { readonly kind: "date"; readonly date: CalendarDate }
  | { readonly kind: "unresolved"; readonly reason: WithholdReason };

const absolutePattern = /^(\d{8})T(\d{6})Z$/u;
const floatingPattern = /^(\d{8})T(\d{6})$/u;
const datePattern = /^\d{8}$/u;

const wallTimeOf = (value: string): WallTime => ({ kind: "wallTime", value });

const calendarDateOf = (value: string): CalendarDate => ({
  kind: "calendarDate",
  value: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
});

const utcInstantOf = (value: string): Instant => {
  const [, date, time] = absolutePattern.exec(value) ?? [];
  if (!date || !time) {
    return instantOf(Number.NaN);
  }
  return instantOf(
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(time.slice(0, 2)),
      Number(time.slice(2, 4)),
      Number(time.slice(4, 6)),
    ),
  );
};

const observanceInEffect = (
  rules: DeclaredZoneRules,
  wall: WallTime,
): DeclaredObservance | undefined => {
  const started = rules.observances.filter((observance) => observance.wallStart <= wall.value);
  const ordered = [...started].toSorted((left, right) => left.wallStart.localeCompare(right.wallStart));
  return ordered.at(-1);
};

const declaredInstant = (rules: DeclaredZoneRules, wall: WallTime): Instant | null => {
  const observance = observanceInEffect(rules, wall);
  if (!observance) {
    return null;
  }
  const localMs = Date.UTC(
    Number(wall.value.slice(0, 4)),
    Number(wall.value.slice(4, 6)) - 1,
    Number(wall.value.slice(6, 8)),
    Number(wall.value.slice(9, 11)),
    Number(wall.value.slice(11, 13)),
    Number(wall.value.slice(13, 15)),
  );
  return instantOf(localMs - observance.offsetToMinutes * millisecondsInMinute);
};

const anchorWallTime = (
  identifier: string,
  wall: WallTime,
  document: IcsDocument,
  zones: ZoneCache,
): DateValue => {
  if (document.kind !== "readable") {
    return { kind: "unresolved", reason: "unresolvableTimeZone" };
  }
  const declared = document.declaredZones.find((zone) => zone.declaredId === identifier) ?? null;
  const resolution = resolveZoneIdentifier(identifier, document.declaredZones, zones);
  if (resolution.kind === "resolved" && isIanaAuthoritative(declared, resolution.zone)) {
    return {
      kind: "instant",
      instant: resolveWallTime(wall, resolution.zone, zones).instant,
      zone: resolution.zone,
    };
  }
  const rules = document.zoneRules.find((candidate) => candidate.declaredId === identifier);
  if (rules) {
    const instant = declaredInstant(rules, wall);
    if (instant) {
      if (resolution.kind === "resolved") {
        return { kind: "instant", instant, zone: resolution.zone };
      }
      return { kind: "instant", instant, zone: null };
    }
  }
  if (resolution.kind === "resolved") {
    return {
      kind: "instant",
      instant: resolveWallTime(wall, resolution.zone, zones).instant,
      zone: resolution.zone,
    };
  }
  return { kind: "unresolved", reason: "unresolvableTimeZone" };
};

const resolveFloating = (
  value: string,
  property: PropertyLine,
  eventZone: string | null,
  document: IcsDocument,
  zones: ZoneCache,
): DateValue => {
  const stated = parameterValue(property.params, "TZID") ?? eventZone;
  if (stated) {
    return anchorWallTime(stated, wallTimeOf(value), document, zones);
  }
  if (document.kind === "readable" && document.calendarZone) {
    return anchorWallTime(document.calendarZone, wallTimeOf(value), document, zones);
  }
  return { kind: "unresolved", reason: "unresolvableTimeZone" };
};

const resolveDateValue = (
  property: PropertyLine,
  value: string,
  eventZone: string | null,
  document: IcsDocument,
  zones: ZoneCache,
): DateValue => {
  const trimmed = value.trim();
  if (parameterValue(property.params, "VALUE") === "DATE") {
    if (!isRealCalendarDate(trimmed)) {
      return { kind: "unresolved", reason: "unparseable" };
    }
    return { kind: "date", date: calendarDateOf(trimmed) };
  }
  if (absolutePattern.test(trimmed)) {
    return { kind: "instant", instant: utcInstantOf(trimmed), zone: null };
  }
  if (floatingPattern.test(trimmed)) {
    return resolveFloating(trimmed, property, eventZone, document, zones);
  }
  if (datePattern.test(trimmed)) {
    return { kind: "unresolved", reason: "unparseable" };
  }
  return { kind: "unresolved", reason: "unparseable" };
};

const icsUtcOf = (instant: Instant): string => {
  const at = new Date(instant.value);
  return `${padded(at.getUTCFullYear(), 4)}${padded(at.getUTCMonth() + 1, 2)}${padded(at.getUTCDate(), 2)}T${padded(at.getUTCHours(), 2)}${padded(at.getUTCMinutes(), 2)}${padded(at.getUTCSeconds(), 2)}Z`;
};

const dateAsInstant = (date: CalendarDate): Instant => instantOf(Date.parse(`${date.value}T00:00:00.000Z`));

const instantOfDateValue = (value: DateValue): Instant | null => {
  switch (value.kind) {
    case "instant": {
      return value.instant;
    }
    case "date": {
      return dateAsInstant(value.date);
    }
    case "unresolved": {
      return null;
    }
    default: {
      return assertNever(value);
    }
  }
};

export { calendarDateOf, dateAsInstant, icsUtcOf, instantOfDateValue, resolveDateValue, utcInstantOf };
export type { DateValue };
