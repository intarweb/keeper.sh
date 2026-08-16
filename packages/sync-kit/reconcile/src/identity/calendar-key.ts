import type { CalendarKey } from "@keeper.sh/sync-protocol";

const calendarKeyString = (key: CalendarKey): string => {
  throw new Error(`unimplemented: calendarKeyString(${key.provider})`);
};

export { calendarKeyString };
