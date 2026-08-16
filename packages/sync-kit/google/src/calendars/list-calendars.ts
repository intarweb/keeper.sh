import type { calendar_v3 } from "@googleapis/calendar";
import type {
  AccountId,
  CalendarAccess,
  CalendarEnumeration,
  CalendarKey,
  CalendarRef,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { RequestSeam } from "../client/request";
import { decodeZoneId } from "../decode/event-time";
import { toProviderFailure } from "../errors/to-provider-failure";
import type { GoogleDependencies } from "../dependencies";

interface EnumerationSurroundings {
  readonly dependencies: GoogleDependencies;
  readonly requests: RequestSeam;
}

const writableRoles = new Set(["owner", "writer"]);

const accessOf = (entry: calendar_v3.Schema$CalendarListEntry): CalendarAccess => {
  if (typeof entry.accessRole === "string" && writableRoles.has(entry.accessRole)) {
    return "readWrite";
  }
  return "readOnly";
};

const keyOf = (account: AccountId, calendarId: string): CalendarKey => ({
  provider: "google",
  account,
  calendar: { kind: "calendarId", value: calendarId },
});

const refOf = (
  entry: calendar_v3.Schema$CalendarListEntry,
  account: AccountId,
): CalendarRef | null => {
  const calendarId = entry.id;
  if (typeof calendarId !== "string" || calendarId.length === 0) {
    return null;
  }
  return {
    key: keyOf(account, calendarId),
    displayName: entry.summary ?? calendarId,
    timeZone: decodeZoneId(entry.timeZone),
    access: accessOf(entry),
  };
};

const enumerationOf = (
  page: calendar_v3.Schema$CalendarList,
  account: AccountId,
): CalendarEnumeration => ({
  kind: "snapshot",
  account,
  calendars: (page.items ?? []).flatMap((entry) => {
    const ref = refOf(entry, account);
    if (ref === null) {
      return [];
    }
    return [ref];
  }),
});

const listGoogleCalendars = async (
  account: AccountId,
  context: OperationContext,
  surroundings: EnumerationSurroundings,
): Promise<Result<CalendarEnumeration>> => {
  const answered = await surroundings.requests.send("listCalendars", context, (signal) =>
    surroundings.dependencies.calendar.calendarList.list({}, { signal }),
  );
  switch (answered.kind) {
    case "answered": {
      return { ok: true, value: enumerationOf(answered.value.data, account) };
    }
    case "notAttempted": {
      return { ok: false, failure: { kind: "notAttempted", reason: answered.reason } };
    }
    case "failed": {
      return {
        ok: false,
        failure: toProviderFailure(answered.failure, {
          operation: "listCalendars",
          calendar: keyOf(account, "primary"),
          scope: null,
        }),
      };
    }
    default: {
      return assertNever(answered);
    }
  }
};

export { listGoogleCalendars };
export type { EnumerationSurroundings };
