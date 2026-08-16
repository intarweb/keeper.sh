import type {
  IdempotencyKey,
  NotAttemptedReason,
  OperationContext,
  ProviderFailure,
  RemoteEventId,
  RemoteRef,
  WritableCalendar,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { graphJson } from "../client/graph-call";
import { preferHeaders } from "../client/prefer";
import { extendedPropertyValue, mirroredUidPropertyName } from "../decode/extended-property";
import type { MicrosoftFailure } from "../errors/classify";
import { toProviderFailure } from "../errors/to-provider-failure";
import type { WriteSurroundings } from "./surroundings";

type RemoteRead =
  | { readonly kind: "found"; readonly event: GraphEvent }
  | { readonly kind: "absent" }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

const remoteRefOf = (id: string): RemoteRef => ({
  id: { kind: "remoteEventId", value: id },
  deleteHandle: { kind: "deleteHandle", value: id },
});

const writeFailure = (
  failure: MicrosoftFailure,
  calendar: WritableCalendar,
): ProviderFailure =>
  toProviderFailure(failure, {
    operation: "write",
    account: calendar.key.account,
    calendar: calendar.key,
    scope: null,
  });

const calendarPathOf = (calendar: WritableCalendar): string =>
  `users/${calendar.key.account.value}/calendars/${calendar.key.calendar.value}`;

const eventsPathOf = (calendar: WritableCalendar): string => `${calendarPathOf(calendar)}/events`;

const eventPathOf = (calendar: WritableCalendar, event: string): string =>
  `${eventsPathOf(calendar)}/${event}`;

const mailboxesOf = (calendar: WritableCalendar): readonly string[] => [
  calendar.key.account.value,
];

const readProperty = (value: unknown, name: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return Reflect.get(value, name);
};

const isGraphEvent = (value: unknown): value is GraphEvent =>
  typeof value === "object" && value !== null;

const valuesOf = (body: unknown): readonly unknown[] => {
  const held = readProperty(body, "value");
  if (!Array.isArray(held)) {
    return [];
  }
  return held;
};

const readRemoteEvent = async (
  calendar: WritableCalendar,
  target: RemoteEventId,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<RemoteRead> => {
  const answered = await surroundings.requests.send<unknown>({
    operation: "write",
    mailboxes: mailboxesOf(calendar),
    context,
    send: (signal) =>
      graphJson(
        surroundings.dependencies.graph,
        { method: "get", path: eventPathOf(calendar, target.value), headers: preferHeaders() },
        signal,
      ),
  });
  switch (answered.kind) {
    case "answered": {
      if (!isGraphEvent(answered.value)) {
        return { kind: "absent" };
      }
      return { kind: "found", event: answered.value };
    }
    case "failed": {
      if (answered.failure.kind === "notFound" || answered.failure.kind === "gone") {
        return { kind: "absent" };
      }
      return { kind: "failed", failure: answered.failure };
    }
    case "notAttempted": {
      return { kind: "notAttempted", reason: answered.reason };
    }
    default: {
      return assertNever(answered);
    }
  }
};

const carriesKey = (item: unknown, key: IdempotencyKey): boolean => {
  if (!isGraphEvent(item)) {
    return false;
  }
  return extendedPropertyValue(item, mirroredUidPropertyName) === key.value;
};

const findByIdempotencyKey = async (
  calendar: WritableCalendar,
  key: IdempotencyKey,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<RemoteRead> => {
  const answered = await surroundings.requests.send<unknown>({
    operation: "write",
    mailboxes: mailboxesOf(calendar),
    context,
    send: (signal) =>
      graphJson(
        surroundings.dependencies.graph,
        { method: "get", path: eventsPathOf(calendar), headers: preferHeaders() },
        signal,
      ),
  });
  switch (answered.kind) {
    case "answered": {
      const found = valuesOf(answered.value).findLast((item) => carriesKey(item, key));
      if (!isGraphEvent(found)) {
        return { kind: "absent" };
      }
      return { kind: "found", event: found };
    }
    case "failed": {
      if (answered.failure.kind === "notFound" || answered.failure.kind === "gone") {
        return { kind: "absent" };
      }
      return { kind: "failed", failure: answered.failure };
    }
    case "notAttempted": {
      return { kind: "notAttempted", reason: answered.reason };
    }
    default: {
      return assertNever(answered);
    }
  }
};

export {
  calendarPathOf,
  eventPathOf,
  eventsPathOf,
  findByIdempotencyKey,
  mailboxesOf,
  readRemoteEvent,
  remoteRefOf,
  writeFailure,
};
export type { RemoteRead };
