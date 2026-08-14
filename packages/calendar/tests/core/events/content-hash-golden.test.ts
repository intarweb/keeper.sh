import { describe, expect, it } from "vitest";
import { createSyncEventContentHash } from "../../../src/core/events/content-hash";
import type { SyncableEventContent } from "../../../src/core/events/content-hash";

/*
 * Every live mapping stores this value, and a replace deletes before it adds,
 * so redefining the hash is a fleet-wide rewrite. Pinned literally rather than
 * recomputed, which would move with any change to the definition.
 */
const GOLDEN_DESCRIPTION = [
  "R&D sync",
  "<a href=\"https://x.test/a?b=1&amp;c=2\">https://x.test/a?b=1&amp;c=2</a>",
  "wrapped<br>line",
  "s: <https://tel.meet/x?pin=1&hs=2>",
].join("\n");

const GOLDEN_EVENT: SyncableEventContent = {
  availability: "busy",
  description: GOLDEN_DESCRIPTION,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  isAllDay: false,
  location: "Room 1 &amp; 2",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  startTimeZone: "America/Toronto",
  summary: "Golden fixture",
};

/** The same fields wrapped in the whitespace and line endings `normalizeText` folds away. */
const UNNORMALIZED_EVENT: SyncableEventContent = {
  ...GOLDEN_EVENT,
  description: `\r\n  ${GOLDEN_DESCRIPTION.replaceAll("\n", "\r\n")}  \r\n`,
  location: "  Room 1 &amp; 2\r\n",
  summary: "\r\nGolden fixture  ",
};

const PERSISTED_HASH = "fecdcc4ca76bf1e0bf17d4ea4b07904420c80b549369107bfe94658cf3a2d53e";

describe("createSyncEventContentHash", () => {
  it("hashes the golden fixture to its persisted value", () => {
    expect(createSyncEventContentHash(GOLDEN_EVENT)).toBe(PERSISTED_HASH);
  });

  it("hashes surrounding whitespace and CRLF to that same persisted value", () => {
    expect(createSyncEventContentHash(UNNORMALIZED_EVENT)).toBe(PERSISTED_HASH);
  });

  it("keeps the description's markup, so an escaped ampersand hashes differently", () => {
    expect(createSyncEventContentHash({
      ...GOLDEN_EVENT,
      description: GOLDEN_DESCRIPTION.replaceAll("&amp;", "&"),
    })).not.toBe(PERSISTED_HASH);
  });
});
