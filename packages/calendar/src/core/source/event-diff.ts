import type { SourceEvent } from "../types";

interface ExistingSourceEventState {
  availability?: string | null;
  description?: string | null;
  id: string;
  isAllDay?: boolean | null;
  location?: string | null;
  exceptionDates?: object | string | null;
  recurrenceId?: Date | null;
  recurrenceRule?: object | string | null;
  sourceEventType?: string | null;
  sourceEventUid: string | null;
  startTime: Date;
  startTimeZone?: string | null;
  endTime: Date;
  title?: string | null;
}

interface SourceEventDiffOptions {
  isDeltaSync?: boolean;
  cancelledEventUids?: string[];
}

interface SourceEventIdentityOptions {
  normalizeMissingMetadata?: boolean;
}

const normalizeIdentityIsAllDay = (
  isAllDay: boolean | null | undefined,
  options: SourceEventIdentityOptions,
): string => {
  if (options.normalizeMissingMetadata) {
    return String(isAllDay ?? false);
  }

  return String(isAllDay);
};

const normalizeIdentityContent = (value: string | null | undefined): string =>
  value?.trim() ?? "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toStableComparableValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toStableComparableValue(entry));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => [key, toStableComparableValue(nestedValue)]);
    return Object.fromEntries(entries);
  }

  return value;
};

const parseStoredStructuredValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const serializeIdentityValue = (value: unknown): string => {
  if (value === null || value === globalThis.undefined) {
    return "";
  }

  return JSON.stringify(toStableComparableValue(parseStoredStructuredValue(value)));
};

interface SourceEventIdentityInput {
  sourceEventUid: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean | null;
  availability?: string | null;
  sourceEventType?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  exceptionDates?: object | string | null;
  recurrenceId?: Date | null;
  recurrenceRule?: object | string | null;
  startTimeZone?: string | null;
}

const buildSourceEventIdentityKey = (
  input: SourceEventIdentityInput,
  options: SourceEventIdentityOptions = {},
): string =>
  [
    input.sourceEventUid,
    input.startTime.toISOString(),
    input.endTime.toISOString(),
    normalizeIdentityIsAllDay(input.isAllDay, options),
    input.availability ?? "",
    input.sourceEventType ?? "default",
    normalizeIdentityContent(input.title),
    normalizeIdentityContent(input.description),
    normalizeIdentityContent(input.location),
    normalizeIdentityContent(input.startTimeZone),
    serializeIdentityValue(input.recurrenceRule),
    serializeIdentityValue(input.exceptionDates),
    input.recurrenceId?.toISOString() ?? "",
  ].join("|");

const buildSourceEventStorageIdentityKey = (
  sourceEventUid: string,
  startTime: Date,
  endTime: Date,
): string => `${sourceEventUid}|${startTime.toISOString()}|${endTime.toISOString()}`;

const deduplicateIncomingEvents = (incomingEvents: SourceEvent[]): SourceEvent[] => {
  const dedupedByStorageIdentity = new Map<string, SourceEvent>();

  for (const incomingEvent of incomingEvents) {
    const storageIdentity = buildSourceEventStorageIdentityKey(
      incomingEvent.uid,
      incomingEvent.startTime,
      incomingEvent.endTime,
    );
    dedupedByStorageIdentity.set(storageIdentity, incomingEvent);
  }

  return [...dedupedByStorageIdentity.values()];
};

const buildExistingEventIdentitySet = (
  existingEvents: ExistingSourceEventState[],
  options: SourceEventIdentityOptions = {},
): Set<string> => {
  const identities = new Set<string>();

  for (const existingEvent of existingEvents) {
    if (existingEvent.sourceEventUid === null) {
      continue;
    }

    identities.add(
      buildSourceEventIdentityKey(
        {
          availability: existingEvent.availability,
          description: existingEvent.description,
          endTime: existingEvent.endTime,
          exceptionDates: existingEvent.exceptionDates,
          isAllDay: existingEvent.isAllDay,
          location: existingEvent.location,
          recurrenceId: existingEvent.recurrenceId,
          recurrenceRule: existingEvent.recurrenceRule,
          sourceEventType: existingEvent.sourceEventType,
          sourceEventUid: existingEvent.sourceEventUid,
          startTime: existingEvent.startTime,
          startTimeZone: existingEvent.startTimeZone,
          title: existingEvent.title,
        },
        options,
      ),
    );
  }

  return identities;
};

const buildSourceEventsToAdd = (
  existingEvents: ExistingSourceEventState[],
  incomingEvents: SourceEvent[],
  options: SourceEventDiffOptions = {},
): SourceEvent[] => {
  const normalizedIncomingEvents = deduplicateIncomingEvents(incomingEvents);
  const existingIdentities = buildExistingEventIdentitySet(existingEvents, {
    normalizeMissingMetadata: options.isDeltaSync ?? false,
  });

  return normalizedIncomingEvents.filter(
    (incomingEvent) =>
      !existingIdentities.has(
        buildSourceEventIdentityKey(
          {
            availability: incomingEvent.availability,
            description: incomingEvent.description,
            endTime: incomingEvent.endTime,
            exceptionDates: incomingEvent.exceptionDates,
            isAllDay: incomingEvent.isAllDay,
            location: incomingEvent.location,
            recurrenceId: incomingEvent.recurrenceId,
            recurrenceRule: incomingEvent.recurrenceRule,
            sourceEventType: incomingEvent.sourceEventType,
            sourceEventUid: incomingEvent.uid,
            startTime: incomingEvent.startTime,
            startTimeZone: incomingEvent.startTimeZone,
            title: incomingEvent.title,
          },
          { normalizeMissingMetadata: options.isDeltaSync ?? false },
        ),
      ),
  );
};

const buildSourceEventStateIdsToRemove = (
  existingEvents: ExistingSourceEventState[],
  incomingEvents: SourceEvent[],
  options: SourceEventDiffOptions = {},
): string[] => {
  const normalizedIncomingEvents = deduplicateIncomingEvents(incomingEvents);
  const { isDeltaSync = false, cancelledEventUids } = options;

  if (isDeltaSync) {
    if (!cancelledEventUids || cancelledEventUids.length === 0) {
      return [];
    }

    const cancelledUidSet = new Set(cancelledEventUids);

    return existingEvents
      .filter(
        (existingEvent) =>
          existingEvent.sourceEventUid !== null
          && cancelledUidSet.has(existingEvent.sourceEventUid),
      )
      .map((existingEvent) => existingEvent.id);
  }

  const incomingStorageIdentitySet = new Set(
    normalizedIncomingEvents.map((incomingEvent) =>
      buildSourceEventStorageIdentityKey(
        incomingEvent.uid,
        incomingEvent.startTime,
        incomingEvent.endTime,
      )),
  );

  return existingEvents
    .filter((existingEvent) => {
      if (existingEvent.sourceEventUid === null) {
        return false;
      }

      const existingStorageIdentityKey = buildSourceEventStorageIdentityKey(
        existingEvent.sourceEventUid,
        existingEvent.startTime,
        existingEvent.endTime,
      );

      return !incomingStorageIdentitySet.has(existingStorageIdentityKey);
    })
    .map((existingEvent) => existingEvent.id);
};

export {
  buildSourceEventIdentityKey,
  buildSourceEventsToAdd,
  buildSourceEventStateIdsToRemove,
};
export type { ExistingSourceEventState, SourceEventDiffOptions };
