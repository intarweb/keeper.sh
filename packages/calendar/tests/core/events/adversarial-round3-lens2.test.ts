import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import { canonicalizeComparableText, htmlToPlainText } from "../../../src/core/events/html-text";
import type { EventMapping } from "../../../src/core/events/mappings";
import type { MaterializedSyncableEvent, RemoteEvent } from "../../../src/core/types";

const SCOPE: ReconciliationScope = {
  authoritativeWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
  requestedWindow: {
    timeMax: new Date("2100-01-01T00:00:00.000Z"),
    timeMin: new Date("2000-01-01T00:00:00.000Z"),
  },
};

const createLocalEvent = (description: string): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
});

const createMapping = (event: MaterializedSyncableEvent): EventMapping => ({
  calendarId: "destination-calendar-id",
  deleteIdentifier: "delete-identifier-1",
  destinationEventUid: "destination-uid-1",
  endTime: event.endTime,
  eventStateId: event.id,
  id: "mapping-id-1",
  sourceCalendarId: "source-calendar-id",
  startTime: event.startTime,
  syncEventHash: createSyncEventContentHash(event),
  syncEventId: event.id,
});

const reconcile = (event: MaterializedSyncableEvent, remoteDescription: string) => {
  const mapping = createMapping(event);
  const content = createEditableEventContentSnapshot({ ...event, description: remoteDescription });
  const remote: RemoteEvent = {
    deleteId: mapping.deleteIdentifier,
    editableAvailability: "busy",
    editableContent: content,
    editableContentHash: hashEditableEventContentSnapshot(content),
    endTime: event.endTime,
    isKeeperEvent: true,
    startTime: event.startTime,
    supportedAvailabilities: ["busy", "free"],
    uid: mapping.destinationEventUid,
  };
  return computeSyncOperations([event], [mapping], [remote], SCOPE);
};

const escapeOnce = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const escapeTimes = (value: string, times: number): string => {
  if (times === 0) {
    return value;
  }

  return escapeTimes(escapeOnce(value), times - 1);
};

const PRETTY_OUTLOOK_BODY = `<html>
<head><meta charset="utf-8"></head>
<body>
  <p>Quarterly planning sync.</p>
  <p>Join the meeting now</p>
</body>
</html>`;

const COMPACT_ECHO =
  "<html><head><meta charset=\"utf-8\"></head><body>"
  + "<p>Quarterly planning sync.</p><p>Join the meeting now</p></body></html>";

describe("R3L2-A: insignificant HTML whitespace is counted as blank lines", () => {
  it("converges when the destination re-serializes the same HTML without inter-tag newlines", () => {
    expect(canonicalizeComparableText(PRETTY_OUTLOOK_BODY))
      .toBe(canonicalizeComparableText(COMPACT_ECHO));
  });

  it("does not churn on a pretty-printed HTML body echoed back compacted", () => {
    const result = reconcile(createLocalEvent(PRETTY_OUTLOOK_BODY), COMPACT_ECHO);

    expect(result.staleMappingIds).toEqual([]);
    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(0);
  });

  it("does not churn when the destination renders block elements as <br><br>", () => {
    const local = "<p>Quarterly planning sync.</p><p>Join the meeting now</p>";
    const echo = "Quarterly planning sync.<br><br>Join the meeting now";

    expect(canonicalizeComparableText(local)).toBe(canonicalizeComparableText(echo));
    expect(reconcile(createLocalEvent(local), echo).staleMappingIds).toEqual([]);
  });

  it("still sees a genuine remote edit that inserts a blank paragraph", () => {
    const local = "<p>Quarterly planning sync.</p><p>Join the meeting now</p>";
    const edited = "<p>Quarterly planning sync.</p><p><br></p><p>Join the meeting now</p>";

    expect(canonicalizeComparableText(edited)).not.toBe(canonicalizeComparableText(local));
  });

  /*
   * A paragraph is worth the blank line every renderer draws around it, which
   * is the only reading that agrees with `<br><br>` above and with what the
   * write path owes a reader. The finding this pins is the whitespace: the
   * newline and the indent between the two tags must leave no trace.
   */
  it("does not write blank lines and trailing spaces into the CalDAV DESCRIPTION", () => {
    expect(htmlToPlainText(PRETTY_OUTLOOK_BODY))
      .toBe("Quarterly planning sync.\n\nJoin the meeting now");
  });
});

describe("R3L2-B: anchor text truncated with an ellipsis", () => {
  const URL = "https://example.com/very/long/path/to/the/document?a=1&b=2";
  const local = `Docs: ${URL}`;

  it("converges when the provider truncates the anchor text with an ellipsis", () => {
    const echo =
      `Docs: <a href="${URL.replaceAll("&", "&amp;")}">example.com/very/long/path/to/th…</a>`;

    expect(canonicalizeComparableText(local)).toBe(canonicalizeComparableText(echo));
    expect(reconcile(createLocalEvent(local), echo).staleMappingIds).toEqual([]);
  });

  it("converges when the provider truncates with three dots", () => {
    const echo =
      `Docs: <a href="${URL.replaceAll("&", "&amp;")}">https://example.com/very/long/pa...</a>`;

    expect(reconcile(createLocalEvent(local), echo).staleMappingIds).toEqual([]);
  });
});

describe("R3L2-C: comparison projection is not a fixed point past 16 passes", () => {
  it("is idempotent", () => {
    const value = escapeTimes("Snacks & drinks <b>now</b>", 17);
    expect(canonicalizeComparableText(canonicalizeComparableText(value)))
      .toBe(canonicalizeComparableText(value));
  });

  it("converges with the unescaped description it was produced from", () => {
    const base = "Snacks & drinks <b>now</b>";
    expect(canonicalizeComparableText(escapeTimes(base, 17)))
      .toBe(canonicalizeComparableText(base));
  });
});
