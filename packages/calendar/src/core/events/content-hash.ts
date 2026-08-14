import type { SyncableEvent } from "../types";
import { resolveIsAllDayEvent } from "./all-day";
import { canonicalizeComparableText } from "./html-text";
import stringify from "fast-json-stable-stringify";

type SyncableEventContent = Pick<SyncableEvent, "summary" | "description" | "location">
  & Partial<Pick<
    SyncableEvent,
    | "availability"
    | "isAllDay"
    | "startTime"
    | "endTime"
    | "startTimeZone"
    | "recurrenceRule"
    | "recurrenceDuration"
    | "exceptionDates"
    | "recurrenceId"
  >>;

const normalizeText = (value?: string): string =>
  value?.replaceAll(/\r\n?/g, "\n").trim() ?? "";
const normalizeAvailability = (value?: SyncableEvent["availability"]): string => value ?? "busy";
const resolveHashedAllDay = (event: SyncableEventContent): boolean => {
  if (event.startTime && event.endTime) {
    return resolveIsAllDayEvent({
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      startTime: event.startTime,
    });
  }

  return event.isAllDay ?? false;
};

const createSyncEventContentHash = (event: SyncableEventContent): string => {
  const payload = JSON.stringify([
    normalizeText(event.summary),
    normalizeText(event.description),
    normalizeText(event.location),
    normalizeAvailability(event.availability),
    resolveHashedAllDay(event),
    event.startTime?.toISOString() ?? "",
    event.endTime?.toISOString() ?? "",
    event.startTimeZone ?? "",
    stringify(event.recurrenceDuration ?? null),
    stringify(event.recurrenceRule ?? null),
    [...event.exceptionDates ?? []].map((date) => date.toISOString()).toSorted(),
    event.recurrenceId?.toISOString() ?? "",
  ]);

  return new Bun.CryptoHasher("sha256").update(payload).digest("hex");
};

/*
 * The description is the one field a provider is free to render as HTML, so it
 * alone is compared markup-canonically: a bare URL and a provider's linkified
 * rendering of it are the same description. A summary or a location is text on
 * every provider, where `Interview: <NAME>` is a title and not a tag.
 * `rawDescription` keeps the unprojected value, so a rewrite the projection
 * absorbed stays countable.
 */
interface EditableEventContentSnapshot {
  summary: string;
  description: string;
  location: string;
  isAllDay: boolean;
  rawDescription: string;
}

const createEditableEventContentSnapshot = (
  event: SyncableEventContent,
): EditableEventContentSnapshot => ({
  description: canonicalizeComparableText(event.description),
  isAllDay: resolveHashedAllDay(event),
  location: normalizeText(event.location),
  rawDescription: normalizeText(event.description),
  summary: normalizeText(event.summary),
});

const hasRawEditableContentChange = (
  first: EditableEventContentSnapshot,
  second: EditableEventContentSnapshot,
): boolean => first.rawDescription !== second.rawDescription;

const hashEditableEventContentSnapshot = (snapshot: EditableEventContentSnapshot): string => {
  const payload = JSON.stringify([
    snapshot.summary,
    snapshot.description,
    snapshot.location,
    snapshot.isAllDay,
  ]);

  return new Bun.CryptoHasher("sha256").update(payload).digest("hex");
};

const createEditableEventContentHash = (event: SyncableEventContent): string =>
  hashEditableEventContentSnapshot(createEditableEventContentSnapshot(event));

export {
  createEditableEventContentHash,
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hasRawEditableContentChange,
  hashEditableEventContentSnapshot,
};
export type { EditableEventContentSnapshot, SyncableEventContent };
