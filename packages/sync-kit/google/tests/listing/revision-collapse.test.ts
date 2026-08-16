import { describe, expect, test } from "vitest";
import { collapseRevisions } from "../../src/listing/collapse-revisions";
import { timedItem } from "../support/items";

const older = timedItem({
  id: "twice-changed",
  start: "2026-03-22T09:00:00.000Z",
  end: "2026-03-22T10:00:00.000Z",
  updated: "2026-03-11T09:00:00.000Z",
  etag: '"v1-twice-changed"',
});

const newer = timedItem({
  id: "twice-changed",
  start: "2026-03-22T14:00:00.000Z",
  end: "2026-03-22T15:00:00.000Z",
  updated: "2026-03-11T11:00:00.000Z",
  etag: '"v2-twice-changed"',
});

const unbuildableNewest = {
  id: "twice-changed",
  iCalUID: "twice-changed@google.com",
  etag: '"v3-twice-changed"',
  status: "confirmed",
  summary: "moved somewhere unreadable",
  updated: "2026-03-11T12:00:00.000Z",
  eventType: "default",
  start: { timeZone: "UTC" },
  end: { timeZone: "UTC" },
};

describe("the newest revision of an id wins whichever page carried it", () => {
  test("GOOG-O18: the newest revision wins in either page order", () => {
    const forwards = collapseRevisions([older, newer]);
    const backwards = collapseRevisions([newer, older]);

    expect(forwards.winners).toHaveLength(1);
    expect(backwards.winners).toHaveLength(1);
    expect(forwards.winners.at(0)?.start?.dateTime).toBe("2026-03-22T14:00:00.000Z");
    expect(backwards.winners.at(0)?.start?.dateTime).toBe("2026-03-22T14:00:00.000Z");
  });

  test("GOOG-O18: the revisions that lost are counted, not silently dropped", () => {
    const collapsed = collapseRevisions([older, newer]);

    expect(collapsed.losers).toBe(1);
  });

  test("GOOG-O18: an unbuildable newest revision keeps the older one from winning", () => {
    const collapsed = collapseRevisions([older, newer, unbuildableNewest]);

    expect(collapsed.winners).toHaveLength(1);
    expect(collapsed.winners.at(0)?.etag).toBe('"v3-twice-changed"');
  });
});
