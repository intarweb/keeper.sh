import type { AccountId, CalendarId, ZoneId } from "./handles";
import type { Continuation } from "./change-listing";

const calendarAccessKinds = ["readOnly", "readWrite"] as const;
type CalendarAccess = (typeof calendarAccessKinds)[number];

interface CalendarKey {
  readonly calendar: CalendarId;
}

interface CalendarRef {
  readonly key: CalendarKey;
  readonly displayName: string;
  readonly timeZone: ZoneId | null;
  readonly access: CalendarAccess;
}

type CalendarEnumeration =
  | {
      readonly kind: "snapshot";
      readonly account: AccountId;
      readonly calendars: readonly CalendarRef[];
      readonly continuation?: Continuation;
    }
  | {
      readonly kind: "partial";
      readonly account: AccountId;
      readonly calendars: readonly CalendarRef[];
      readonly continuation?: Continuation;
    };

export { calendarAccessKinds };
export type { CalendarAccess, CalendarEnumeration, CalendarKey, CalendarRef };
