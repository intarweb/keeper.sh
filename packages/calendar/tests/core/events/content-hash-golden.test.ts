import { describe, expect, it } from "vitest";
import { createSyncEventContentHash } from "../../../src/core/events/content-hash";
import type { SyncableEventContent } from "../../../src/core/events/content-hash";

/*
 * Every live mapping stores this value, and a replace deletes before it adds,
 * so redefining the hash is a fleet-wide rewrite. Pinned literally rather than
 * recomputed, which would move with any change to the definition.
 */
const GOLDEN_EVENT: SyncableEventContent = {
  availability: "busy",
  description: [
    "R&D sync",
    "<a href=\"https://x.test/a?b=1&amp;c=2\">https://x.test/a?b=1&amp;c=2</a>",
    "wrapped<br>line",
    "s: <https://tel.meet/x?pin=1&hs=2>",
  ].join("\n"),
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  isAllDay: false,
  location: "Room 1 &amp; 2",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  startTimeZone: "America/Toronto",
  summary: "Golden fixture",
};

describe("createSyncEventContentHash", () => {
  it("hashes the golden fixture to its persisted value", () => {
    expect(createSyncEventContentHash(GOLDEN_EVENT)).toBe(
      "fecdcc4ca76bf1e0bf17d4ea4b07904420c80b549369107bfe94658cf3a2d53e",
    );
  });
});
