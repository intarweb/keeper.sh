import { type } from "arktype";

/*
 * ICS recurrence-related shapes mirroring ts-ics's IcsDateObject and IcsRecurrenceRule.
 * Date fields use `string.date.iso.parse` so values stored as ISO strings in JSON text
 * are validated and morphed back into Date instances on read — ts-ics requires real Date
 * objects on its in-memory shape.
 */
const icsWeekDaySchema = type("'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'");

const icsDateObjectSchema = type({
  date: "string.date.iso.parse",
  "type?": "'DATE' | 'DATE-TIME'",
  "local?": {
    date: "string.date.iso.parse",
    timezone: "string",
    tzoffset: "string",
  },
});
type StoredIcsDateObject = typeof icsDateObjectSchema.infer;

const icsDurationSchema = type({
  "before?": "boolean",
  "weeks?": "number",
  "days?": "number",
  "hours?": "number",
  "minutes?": "number",
  "seconds?": "number",
});

const icsRecurrenceRuleSchema = type({
  frequency: "'SECONDLY' | 'MINUTELY' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'",
  "until?": icsDateObjectSchema,
  "count?": "number",
  "interval?": "number",
  "bySecond?": "number[]",
  "byMinute?": "number[]",
  "byHour?": "number[]",
  "byDay?": type({ day: icsWeekDaySchema, "occurrence?": "number" }).array(),
  "byMonthday?": "number[]",
  "byYearday?": "number[]",
  "byWeekNo?": "number[]",
  "byMonth?": "number[]",
  "bySetPos?": "number[]",
  "workweekStart?": icsWeekDaySchema,
});

const storedIcsRecurrenceRuleSchema = icsRecurrenceRuleSchema.and({
  "recurrenceDuration?": icsDurationSchema,
});
type StoredIcsRecurrenceRule = typeof storedIcsRecurrenceRuleSchema.infer;

const icsExceptionDatesSchema = icsDateObjectSchema.array();
type StoredIcsExceptionDates = typeof icsExceptionDatesSchema.infer;

export {
  icsDateObjectSchema,
  icsDurationSchema,
  icsExceptionDatesSchema,
  icsRecurrenceRuleSchema,
  icsWeekDaySchema,
  storedIcsRecurrenceRuleSchema,
};

export type { StoredIcsDateObject, StoredIcsExceptionDates, StoredIcsRecurrenceRule };
