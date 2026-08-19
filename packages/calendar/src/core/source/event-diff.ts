import type { SourceEvent } from "../types";
import type { IcsDuration, IcsExceptionDates, IcsRecurrenceRule } from "ts-ics";
import stringify from "fast-json-stable-stringify";
import { buildSourceEventInstanceKey } from "./event-instance";
import type { ExistingSourceEventState } from "./stored-event-state";

interface SourceEventDiffOptions {
  changedEventIds?: string[];
  isDeltaSync?: boolean;
  cancelledEventIds?: string[];
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

const canonicalizeStructuredIdentityValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => canonicalizeStructuredIdentityValue(entry))
      .toSorted((first, second) => stringify(first).localeCompare(stringify(second)));
  }
  if (value instanceof Date) {
    return value;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        canonicalizeStructuredIdentityValue(entry),
      ]),
    );
  }
  return value;
};

const serializeStructuredIdentityValue = (
  value: IcsDuration | IcsExceptionDates | IcsRecurrenceRule | null | undefined,
): string => {
  if (value === null || value === globalThis.undefined) {
    return "";
  }

  return stringify(canonicalizeStructuredIdentityValue(value));
};

const resolveExistingSourceEventInstanceKey = (
  event: ExistingSourceEventState,
): string => buildSourceEventInstanceKey({
  endTime: event.endTime,
  recurrenceId: event.recurrenceId,
  startTime: event.startTime,
  uid: event.sourceEventUid ?? "",
});

interface SourceEventIdentityInput {
  sourceEventId?: string | null;
  sourceEventInstanceKey: string;
  sourceEventUid: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean | null;
  availability?: string | null;
  sourceEventType?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  exceptionDates?: IcsExceptionDates | null;
  recurrenceId?: Date | null;
  recurrenceDuration?: SourceEvent["recurrenceDuration"];
  recurrenceRule?: IcsRecurrenceRule | null;
  startTimeZone?: string | null;
}

const buildSourceEventIdentityKey = (
  input: SourceEventIdentityInput,
  options: SourceEventIdentityOptions = {},
): string =>
  stringify([
    input.sourceEventId ?? "",
    input.sourceEventUid,
    input.sourceEventInstanceKey,
    input.startTime.toISOString(),
    input.endTime.toISOString(),
    normalizeIdentityIsAllDay(input.isAllDay, options),
    input.availability ?? "",
    input.sourceEventType ?? "default",
    normalizeIdentityContent(input.title),
    normalizeIdentityContent(input.description),
    normalizeIdentityContent(input.location),
    normalizeIdentityContent(input.startTimeZone),
    serializeStructuredIdentityValue(input.recurrenceDuration),
    serializeStructuredIdentityValue(input.recurrenceRule),
    serializeStructuredIdentityValue(input.exceptionDates),
    input.recurrenceId?.toISOString() ?? "",
  ]);

const deduplicateIncomingEvents = (incomingEvents: SourceEvent[]): SourceEvent[] => {
  const dedupedEvents = new Map<string, SourceEvent>();

  for (const incomingEvent of incomingEvents) {
    if (incomingEvent.sourceEventId) {
      dedupedEvents.set(`provider:${incomingEvent.sourceEventId}`, incomingEvent);
      continue;
    }

    const storageIdentity = `instance:${buildSourceEventInstanceKey(incomingEvent)}`;
    dedupedEvents.set(storageIdentity, incomingEvent);
  }

  return [...dedupedEvents.values()];
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
          recurrenceDuration: existingEvent.recurrenceDuration,
          recurrenceRule: existingEvent.recurrenceRule,
          sourceEventInstanceKey: resolveExistingSourceEventInstanceKey(existingEvent),
          sourceEventType: existingEvent.sourceEventType,
          sourceEventId: existingEvent.sourceEventId,
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

const isRescheduleCandidateEvent = (event: SourceEvent): boolean =>
  !event.sourceEventId && !event.recurrenceId;

const isRescheduleCandidateStoredEvent = (
  event: ExistingSourceEventState,
): event is ExistingSourceEventState & { sourceEventUid: string } =>
  !event.sourceEventId && !event.recurrenceId && event.sourceEventUid !== null;

const countRescheduleCandidatesByUid = (events: SourceEvent[]): Map<string, number> => {
  const countsByUid = new Map<string, number>();
  for (const event of events) {
    if (!isRescheduleCandidateEvent(event)) {
      continue;
    }
    countsByUid.set(event.uid, (countsByUid.get(event.uid) ?? 0) + 1);
  }
  return countsByUid;
};

/*
 * The write path decides in-place reschedules from the insert batch alone, so a
 * batch carrying only part of a UID's cohort disagrees with the feed-level count
 * the removal diff used and the two copies destroy each other on alternate runs.
 */
const widenToDuplicateUidCohorts = (
  normalizedIncomingEvents: SourceEvent[],
  newEvents: SourceEvent[],
): SourceEvent[] => {
  const feedCountsByUid = countRescheduleCandidatesByUid(normalizedIncomingEvents);
  const sharesUidWithinFeed = (event: SourceEvent): boolean =>
    isRescheduleCandidateEvent(event) && (feedCountsByUid.get(event.uid) ?? 0) > 1;

  const ambiguousUids = new Set(
    newEvents.filter((newEvent) => sharesUidWithinFeed(newEvent))
      .map((newEvent) => newEvent.uid),
  );
  if (ambiguousUids.size === 0) {
    return newEvents;
  }

  const newEventSet = new Set(newEvents);
  return normalizedIncomingEvents.filter((incomingEvent) =>
    newEventSet.has(incomingEvent)
    || (isRescheduleCandidateEvent(incomingEvent) && ambiguousUids.has(incomingEvent.uid)));
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

  const newEvents = normalizedIncomingEvents.filter(
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
            recurrenceDuration: incomingEvent.recurrenceDuration,
            recurrenceRule: incomingEvent.recurrenceRule,
            sourceEventInstanceKey: buildSourceEventInstanceKey(incomingEvent),
            sourceEventType: incomingEvent.sourceEventType,
            sourceEventId: incomingEvent.sourceEventId,
            sourceEventUid: incomingEvent.uid,
            startTime: incomingEvent.startTime,
            startTimeZone: incomingEvent.startTimeZone,
            title: incomingEvent.title,
          },
          { normalizeMissingMetadata: options.isDeltaSync ?? false },
        ),
      ),
  );

  if (options.isDeltaSync) {
    return newEvents;
  }

  return widenToDuplicateUidCohorts(normalizedIncomingEvents, newEvents);
};

const buildSourceEventStateIdsToRemove = (
  existingEvents: ExistingSourceEventState[],
  incomingEvents: SourceEvent[],
  options: SourceEventDiffOptions = {},
): string[] => {
  const normalizedIncomingEvents = deduplicateIncomingEvents(incomingEvents);
  const { changedEventIds, isDeltaSync = false, cancelledEventIds } = options;
  const incomingProviderIdSet = new Set(
    normalizedIncomingEvents.flatMap((incomingEvent) => {
      if (!incomingEvent.sourceEventId) {
        return [];
      }
      return [incomingEvent.sourceEventId];
    }),
  );
  const providerBackedStorageIdentitySet = new Set(
    normalizedIncomingEvents.flatMap((incomingEvent) => {
      if (!incomingEvent.sourceEventId) {
        return [];
      }

      return [buildSourceEventInstanceKey(incomingEvent)];
    }),
  );

  if (isDeltaSync) {
    const changedEventIdSet = new Set(changedEventIds);
    const cancelledEventIdSet = new Set(cancelledEventIds);
    const changedEventsById = new Map(
      normalizedIncomingEvents.flatMap((event) => {
        if (!event.sourceEventId) {
          return [];
        }
        return [[event.sourceEventId, event] as const];
      }),
    );

    return existingEvents
      .filter((existingEvent) => {
        if (!existingEvent.sourceEventId) {
          if (existingEvent.sourceEventUid === null) {
            return false;
          }

          return providerBackedStorageIdentitySet.has(
            resolveExistingSourceEventInstanceKey(existingEvent),
          );
        }

        if (cancelledEventIdSet.has(existingEvent.sourceEventId)) {
          return true;
        }

        if (!changedEventIdSet.has(existingEvent.sourceEventId)) {
          return false;
        }

        return !changedEventsById.has(existingEvent.sourceEventId);
      })
      .map((existingEvent) => existingEvent.id);
  }

  const incomingStorageIdentitySet = new Set(
    normalizedIncomingEvents.map((incomingEvent) =>
      buildSourceEventInstanceKey(incomingEvent)),
  );
  const uidKeyedIncomingStorageIdentitySet = new Set(
    normalizedIncomingEvents.flatMap((incomingEvent) => {
      if (incomingEvent.sourceEventId) {
        return [];
      }
      return [buildSourceEventInstanceKey(incomingEvent)];
    }),
  );
  const storedCandidateCountsByUid = new Map<string, number>();
  for (const existingEvent of existingEvents) {
    if (!isRescheduleCandidateStoredEvent(existingEvent)) {
      continue;
    }
    storedCandidateCountsByUid.set(
      existingEvent.sourceEventUid,
      (storedCandidateCountsByUid.get(existingEvent.sourceEventUid) ?? 0) + 1,
    );
  }
  const incomingCandidateCountsByUid = countRescheduleCandidatesByUid(normalizedIncomingEvents);
  /*
   * Removing a rescheduled row severs its destination mapping, so the destination
   * sees a cancellation plus a fresh invite instead of a move.
   */
  const isUnambiguousReschedule = (existingEvent: ExistingSourceEventState): boolean =>
    isRescheduleCandidateStoredEvent(existingEvent)
    && storedCandidateCountsByUid.get(existingEvent.sourceEventUid) === 1
    && incomingCandidateCountsByUid.get(existingEvent.sourceEventUid) === 1;

  return existingEvents
    .filter((existingEvent) => {
      if (existingEvent.sourceEventId) {
        return !incomingProviderIdSet.has(existingEvent.sourceEventId);
      }

      if (existingEvent.sourceEventUid === null) {
        return false;
      }

      const existingStorageIdentityKey = resolveExistingSourceEventInstanceKey(existingEvent);

      /*
       * A slot still claimed by a uid-keyed incoming twin must survive: the add
       * side treats that twin as already stored, so removing it here makes
       * repeated ingest of an identical feed alternate remove/add forever.
       */
      if (
        providerBackedStorageIdentitySet.has(existingStorageIdentityKey)
        && !uidKeyedIncomingStorageIdentitySet.has(existingStorageIdentityKey)
      ) {
        return true;
      }

      if (incomingStorageIdentitySet.has(existingStorageIdentityKey)) {
        return false;
      }

      return !isUnambiguousReschedule(existingEvent);
    })
    .map((existingEvent) => existingEvent.id);
};

export {
  buildSourceEventIdentityKey,
  buildSourceEventsToAdd,
  buildSourceEventStateIdsToRemove,
};
export type { SourceEventDiffOptions };
export type { ExistingSourceEventState } from "./stored-event-state";
