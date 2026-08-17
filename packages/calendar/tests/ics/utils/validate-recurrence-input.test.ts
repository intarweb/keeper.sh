import { describe, expect, it } from "vitest";
import {
  assertNoUnsupportedRecurrenceDates,
  assertSupportedRecurrenceTimeZones,
} from "../../../src/ics/utils/validate-recurrence-input";
import { parseIcsCalendar } from "../../../src/ics/utils/parse-ics-calendar";
import { parseIcsEvents } from "../../../src/ics/utils/parse-ics-events";

describe("assertNoUnsupportedRecurrenceDates", () => {
  it("rejects folded RDATE properties inside VEVENT", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "RDATE;VALUE=DATE:20260701,",
      " 20260702",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(() => assertNoUnsupportedRecurrenceDates(ics))
      .toThrow("ICS RDATE recurrence is not supported");
  });

  it("allows RDATE inside VTIMEZONE observances supported by ts-ics", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "BEGIN:STANDARD",
      "RDATE:20260701T000000",
      "END:STANDARD",
      "END:VTIMEZONE",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(() => assertNoUnsupportedRecurrenceDates(ics)).not.toThrow();
  });

  it("fails closed when a mismatched component boundary tries to hide event RDATE", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "END:VALARM",
      "RDATE:20260701T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(() => assertNoUnsupportedRecurrenceDates(ics))
      .toThrow("expected END:VEVENT, received END:VALARM");
  });
});

const buildSeries = (eventLines: string[]): string => [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Keeper Test//EN",
  "BEGIN:VEVENT",
  "UID:series-1",
  "SUMMARY:Daily standup",
  "DTSTART;TZID=America/Denver:20260105T090000",
  "DTEND;TZID=America/Denver:20260105T100000",
  ...eventLines,
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("recurrence support across realistic series shapes", () => {
  it("accepts a plain recurring series", () => {
    expect(() => assertNoUnsupportedRecurrenceDates(buildSeries([
      "RRULE:FREQ=DAILY;COUNT=8",
    ]))).not.toThrow();
  });

  it.fails("accepts a series with an extra RDATE occurrence", () => {
    expect(() => assertNoUnsupportedRecurrenceDates(buildSeries([
      "RRULE:FREQ=DAILY;COUNT=8",
      "RDATE;TZID=America/Denver:20260120T090000",
    ]))).not.toThrow();
  });
});

const recurring = (startTimeZone: string) =>
  [{ recurrenceRule: { frequency: "DAILY" }, startTimeZone }] as never;

describe("assertSupportedRecurrenceTimeZones", () => {
  it("accepts an IANA zone", () => {
    expect(() => assertSupportedRecurrenceTimeZones(recurring("America/Denver"))).not.toThrow();
  });

  it("accepts a Windows zone name as written by Outlook", () => {
    expect(() => assertSupportedRecurrenceTimeZones(recurring("Mountain Standard Time")))
      .not.toThrow();
  });

  it.fails("accepts a GMT-offset zone label as written by some Exchange servers", () => {
    expect(() => assertSupportedRecurrenceTimeZones(
      recurring("(UTC-07:00) Mountain Time (US & Canada)"),
    )).not.toThrow();
  });
});

const buildWithVtimezone = (tzid: string, recurringLines: string[]): string => [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN",
  "BEGIN:VTIMEZONE",
  `TZID:${tzid}`,
  "BEGIN:STANDARD",
  "DTSTART:16011104T020000",
  "TZOFFSETFROM:-0600",
  "TZOFFSETTO:-0700",
  "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010311T020000",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0600",
  "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "UID:series-1",
  "SUMMARY:Standup",
  `DTSTART;TZID=${tzid}:20260105T090000`,
  `DTEND;TZID=${tzid}:20260105T100000`,
  ...recurringLines,
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const assertZoneAccepted = (tzid: string, recurringLines: string[]): void => {
  assertSupportedRecurrenceTimeZones(
    parseIcsEvents(parseIcsCalendar({ icsString: buildWithVtimezone(tzid, recurringLines) })),
  );
};

describe("custom VTIMEZONE identifiers declared in the file", () => {
  it("accepts an IANA identifier on a series", () => {
    expect(() => assertZoneAccepted("America/Denver", ["RRULE:FREQ=DAILY;COUNT=8"]))
      .not.toThrow();
  });

  it("accepts a Windows identifier on a series", () => {
    expect(() => assertZoneAccepted("Mountain Standard Time", ["RRULE:FREQ=DAILY;COUNT=8"]))
      .not.toThrow();
  });

  it("accepts an Exchange custom zone label on a single event", () => {
    expect(() => assertZoneAccepted("Customized Time Zone", [])).not.toThrow();
  });

  it.fails("accepts an Exchange custom zone label on a series", () => {
    expect(() => assertZoneAccepted("Customized Time Zone", ["RRULE:FREQ=DAILY;COUNT=8"]))
      .not.toThrow();
  });

  it.fails("accepts a Thunderbird tzurl-style identifier on a series", () => {
    expect(() => assertZoneAccepted(
      "/mozilla.org/20050126_1/America/Denver",
      ["RRULE:FREQ=DAILY;COUNT=8"],
    )).not.toThrow();
  });
});
