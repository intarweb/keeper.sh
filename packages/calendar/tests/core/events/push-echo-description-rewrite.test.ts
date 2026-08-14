import { describe, expect, it } from "vitest";
import { createEditableEventContentSnapshot } from "../../../src/core/events/content-hash";
import { comparePushEchoObservations } from "../../../src/core/events/push-echo";
import type { PushEchoObservation } from "../../../src/core/events/push-echo";

const START = new Date("2026-03-08T14:00:00.000Z");
const END = new Date("2026-03-08T15:00:00.000Z");

const observe = (description: string): PushEchoObservation => ({
  content: createEditableEventContentSnapshot({
    description,
    location: "Room 1",
    startTime: START,
    endTime: END,
    summary: "Standup",
  }),
  endTime: END,
  startTime: START,
});

const SENT = "s: https://tel.meet/abc-def-ghi?pin=123123123123123&hs=2";
const LINKIFIED_ECHO = "s: <a href=\"https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2\">"
  + "https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2</a>";

describe("push echo description divergence", () => {
  it("counts a linkified echo as a description the provider rewrote", () => {
    expect(comparePushEchoObservations(observe(SENT), observe(LINKIFIED_ECHO)).description)
      .toBe(true);
  });

  it("counts a byte-identical echo as unrewritten", () => {
    expect(comparePushEchoObservations(observe(SENT), observe(SENT)).description).toBe(false);
  });

  it("counts an echo that only regained the trailing whitespace as unrewritten", () => {
    expect(comparePushEchoObservations(observe(SENT), observe(`${SENT}\r\n`)).description)
      .toBe(false);
  });
});
