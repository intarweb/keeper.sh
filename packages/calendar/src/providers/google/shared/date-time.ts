import type { PartialGoogleDateTime } from "../types";

const parseEventDateTime = (eventTime: PartialGoogleDateTime): Date => {
  if (eventTime.dateTime) {
    return new Date(eventTime.dateTime);
  }
  if (eventTime.date) {
    return new Date(eventTime.date);
  }
  throw new Error("Event has no date or dateTime");
};

/* An Invalid Date read as a time poisons every hash, comparison and echo it reaches. */
const toReadableDate = (value: Date): Date | null => {
  if (!Number.isFinite(value.getTime())) {
    return null;
  }
  return value;
};

const parseEventTime = (time: PartialGoogleDateTime | undefined): Date | null => {
  if (time?.dateTime) {
    return toReadableDate(new Date(time.dateTime));
  }
  if (time?.date) {
    return toReadableDate(new Date(time.date));
  }
  return null;
};

export { parseEventDateTime, parseEventTime };
