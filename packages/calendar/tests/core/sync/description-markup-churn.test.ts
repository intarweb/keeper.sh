import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
import { canonicalizeComparableText } from "../../../src/core/events/html-text";
import {
  eventToICalString,
  parseICalToRemoteEvent,
} from "../../../src/providers/caldav/shared/ics";
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

const MEET_URL = "https://tel.meet/xxx-xxx-xxx?pin=123123123123123&hs=2";
const SUPPORT_URL = "https://support.google.com/";
const LOCAL_DESCRIPTION = `s: ${MEET_URL}  Learn more about Meet at: ${SUPPORT_URL}`;

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

const LONG_DOC_URL = "https://example.com/very/long/path/to/the/document?a=1&b=2";

const linkify = (href: string, text: string): string =>
  `<a href="${href.replaceAll("&", "&amp;")}">${text.replaceAll("&", "&amp;")}</a>`;

const createLocalEvent = (
  overrides: Partial<MaterializedSyncableEvent> = {},
): MaterializedSyncableEvent => ({
  calendarId: "source-calendar-id",
  calendarName: "Source",
  calendarUrl: null,
  description: LOCAL_DESCRIPTION,
  endTime: new Date("2026-03-08T15:00:00.000Z"),
  id: "event-state-id-1",
  sourceEventUid: "source-event-uid-1",
  startTime: new Date("2026-03-08T14:00:00.000Z"),
  summary: "Standup",
  ...overrides,
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

const createRemoteEvent = (
  event: MaterializedSyncableEvent,
  mapping: EventMapping,
  remote: Partial<MaterializedSyncableEvent>,
): RemoteEvent => {
  const content = createEditableEventContentSnapshot({ ...event, ...remote });
  return {
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
};

const reconcile = (
  local: Partial<MaterializedSyncableEvent>,
  remote: Partial<MaterializedSyncableEvent>,
) => {
  const event = createLocalEvent(local);
  const mapping = createMapping(event);
  return computeSyncOperations(
    [event],
    [mapping],
    [createRemoteEvent(event, mapping, remote)],
    SCOPE,
  );
};

const roundTripThroughCalDAV = (description: string): string =>
  parseICalToRemoteEvent(
    eventToICalString(createLocalEvent({ description }), "uid-1@keeper.sh"),
  )?.description ?? "";

describe("computeSyncOperations against a linkified description echo", () => {
  it("does not churn when the provider linkifies bare URLs, anchor text equal to href", () => {
    const description = `s: ${linkify(MEET_URL, MEET_URL)}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, SUPPORT_URL)}`;

    const result = reconcile({}, { description });

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(0);
    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(0);
  });

  it("does not churn when the provider truncates the anchor text", () => {
    const description = `s: ${linkify(MEET_URL, "tel.meet/xxx-xxx-xxx")}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, "support.google.com")}`;

    const result = reconcile({}, { description });

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(0);
  });

  it("counts a markup-only convergence so the metric can be read after the change", () => {
    const description = `s: ${linkify(MEET_URL, MEET_URL)}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, SUPPORT_URL)}`;

    const result = reconcile({}, { description });

    expect(result.staleReasonCounts.remoteContentMarkupOnlyChanged).toBe(1);
  });

  it("still replaces when the provider truncated the description mid-word", () => {
    const result = reconcile({}, { description: LOCAL_DESCRIPTION.slice(0, 60) });

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces when a word is added, removed or reordered", () => {
    const local = { description: "one two three" };

    expect(reconcile(local, { description: "one two three four" }).staleMappingIds)
      .toEqual(["mapping-id-1"]);
    expect(reconcile(local, { description: "one three" }).staleMappingIds)
      .toEqual(["mapping-id-1"]);
    expect(reconcile(local, { description: "one three two" }).staleMappingIds)
      .toEqual(["mapping-id-1"]);
  });

  it("still replaces when the anchor points somewhere else", () => {
    const elsewhere = "https://tel.meet/yyy-yyy-yyy?pin=999&hs=2";

    const result = reconcile(
      { description: `Join: ${MEET_URL}` },
      { description: `Join: ${linkify(elsewhere, elsewhere)}` },
    );

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces when the line count changes", () => {
    const result = reconcile(
      { description: "line one\nline two" },
      { description: "line one\nline two\nline three" },
    );

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });
});

describe("linkification the destination adds", () => {
  it("does not churn when linkification adds a scheme to a bare domain", () => {
    const result = reconcile(
      { description: "Join at meet.google.com/abc-defg-hij" },
      {
        description:
          "Join at <a href=\"https://meet.google.com/abc-defg-hij\">meet.google.com/abc-defg-hij</a>",
      },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("does not churn when linkification adds a trailing slash", () => {
    const result = reconcile(
      { description: "See https://support.google.com" },
      {
        description:
          "See <a href=\"https://support.google.com/\">https://support.google.com</a>",
      },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges when the provider linkifies a bare www URL by adding a scheme", () => {
    const result = reconcile(
      { description: "Report: www.example.com/report?a=1&b=2" },
      {
        description: "Report: <a href=\"http://www.example.com/report?a=1&amp;b=2\">"
          + "www.example.com/report?a=1&amp;b=2</a>",
      },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges when the provider linkifies a bare domain and adds a trailing slash", () => {
    const result = reconcile(
      { description: "Docs at support.google.com" },
      {
        description:
          "Docs at <a href=\"https://support.google.com/\">support.google.com</a>",
      },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges when the provider truncates the anchor text with an ellipsis", () => {
    const local = `Docs: ${LONG_DOC_URL}`;
    const echo = `Docs: <a href="${LONG_DOC_URL.replaceAll("&", "&amp;")}">`
      + "example.com/very/long/path/to/th…</a>";

    expect(canonicalizeComparableText(local)).toBe(canonicalizeComparableText(echo));
    expect(reconcile({ description: local }, { description: echo }).staleMappingIds).toEqual([]);
  });

  it("converges when the provider truncates with three dots", () => {
    const local = `Docs: ${LONG_DOC_URL}`;
    const echo = `Docs: <a href="${LONG_DOC_URL.replaceAll("&", "&amp;")}">`
      + "https://example.com/very/long/pa...</a>";

    expect(reconcile({ description: local }, { description: echo }).staleMappingIds).toEqual([]);
  });
});

describe("provider escaping and re-serialization the destination applies", () => {
  it("converges when the destination closes the omitted end tags", () => {
    expect(reconcile(
      { description: "<p>Agenda item one<p>Agenda item two" },
      { description: "<p>Agenda item one</p><p>Agenda item two</p>" },
    ).staleMappingIds).toEqual([]);
  });

  it("converges when Google escapes a literal &amp; the source description already contains", () => {
    const result = reconcile(
      { description: "Snacks &amp; drinks" },
      { description: "Snacks &amp;amp; drinks" },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("converges for the measured Meet block when the description also contains &nbsp;", () => {
    const local = "Bring &nbsp; snacks\n"
      + "s: https://tel.meet/abc-def-ghi?pin=123123123123123&hs=2";
    const echo = "Bring &amp;nbsp; snacks<br>"
      + "s: <a href=\"https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2\">"
      + "https://tel.meet/abc-def-ghi?pin=123123123123123&amp;hs=2</a>";

    expect(reconcile({ description: local }, { description: echo }).staleMappingIds).toEqual([]);
  });

  it("converges when the destination echoes the description HTML-escaped", () => {
    const result = reconcile(
      { description: "Use <b>bold</b> markers in the doc" },
      { description: "Use &lt;b&gt;bold&lt;/b&gt; markers in the doc" },
    );

    expect(result.staleMappingIds).toEqual([]);
  });

  it("does not churn on a pretty-printed HTML body echoed back compacted", () => {
    const result = reconcile(
      { description: PRETTY_OUTLOOK_BODY },
      { description: COMPACT_ECHO },
    );

    expect(result.staleMappingIds).toEqual([]);
    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(0);
  });

  it("does not churn when the destination renders block elements as <br><br>", () => {
    const local = "<p>Quarterly planning sync.</p><p>Join the meeting now</p>";
    const echo = "Quarterly planning sync.<br><br>Join the meeting now";

    expect(canonicalizeComparableText(local)).toBe(canonicalizeComparableText(echo));
    expect(reconcile({ description: local }, { description: echo }).staleMappingIds).toEqual([]);
  });
});

describe("blank lines the destination adds or removes", () => {
  /*
   * How many blank lines a break is worth depends on which side still had the
   * markup, so comparison keeps the sequence of lines and drops the gaps. A
   * destination that deletes only a blank line is not compared; one that
   * deletes a line with words on it still is.
   */
  it("does not compare a blank line the destination deleted", () => {
    expect(reconcile(
      { description: "<div>Agenda</div><div><br></div><div>Bring the deck</div>" },
      { description: "<div>Agenda</div><div>Bring the deck</div>" },
    ).staleMappingIds).toEqual([]);
  });

  it("still compares a line the destination deleted", () => {
    expect(reconcile(
      { description: "<div>Agenda</div><div>Bring the deck</div>" },
      { description: "<div>Agenda</div>" },
    ).staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("converges when the destination returns a blank line as an empty block", () => {
    expect(reconcile(
      { description: "Agenda\n\nBring the deck" },
      { description: "<div>Agenda</div><div><br></div><div>Bring the deck</div>" },
    ).staleMappingIds).toEqual([]);
  });
});

describe("remote edits that must still replace the mirror", () => {
  it("replaces the mirror when a labelled link is repointed remotely", () => {
    const result = reconcile(
      { description: "<p>Join <a href=\"https://zoom.us/j/111?pwd=real\">Zoom Meeting</a></p>" },
      { description: "<p>Join <a href=\"https://evil.example/j/999\">Zoom Meeting</a></p>" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("replaces the mirror when the link is stripped from the mirror entirely", () => {
    const result = reconcile(
      { description: "<p>Join <a href=\"https://zoom.us/j/111?pwd=real\">Zoom Meeting</a></p>" },
      { description: "<p>Join Zoom Meeting</p>" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("keeps an angle-bracketed note visible to comparison", () => {
    expect(reconcile(
      { description: "Note <!important> stuff" },
      { description: "Note stuff" },
    ).staleMappingIds).toEqual(["mapping-id-1"]);
  });

  /*
   * Comparison reads every tag as structure so that a destination which closes
   * an omitted end tag still compares equal, which is what it costs: a
   * description edit that removes an angle-bracketed token and nothing else is
   * not compared. The token is still written, and a summary or a location —
   * where one token is a large share of the field — is compared exactly.
   */
  it("still sees a remote edit made beside such a token", () => {
    expect(reconcile(
      { description: "Wear a <hat> and bring an umbrella" },
      { description: "Wear a <hat> and bring a coat" },
    ).staleMappingIds).toEqual(["mapping-id-1"]);
    expect(reconcile(
      { description: "Room <B>, second floor" },
      { description: "Room , second floor" },
    ).staleMappingIds).toEqual([]);
  });

  it("still replaces the mirror when the destination rewrites the text after <style>", () => {
    const result = reconcile(
      { description: "<div>Use the &lt;style&gt; attribute<br>Ship by Friday</div>" },
      { description: "Use the <style> attribute\nEVENT CANCELLED, do not attend" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when the join link after <script> is stripped", () => {
    const local = "<html><body><p>Notes &lt;script&gt; review</p>"
      + "<p>Join <a href=\"https://zoom.us/j/123\">Zoom</a></p></body></html>";
    const result = reconcile(
      { description: local },
      { description: "Notes <script> review" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when the summary after <script> is renamed", () => {
    const result = reconcile(
      { summary: "The <script> review with Sam" },
      { summary: "The <script> review — MOVED to Friday 9am" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when a bracketed token is dropped from the location", () => {
    const result = reconcile(
      { location: "Room <B>, second floor" },
      { location: "Room , second floor" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces the mirror when a bracketed token is dropped from the summary", () => {
    const result = reconcile(
      { summary: "Interview: <NAME> at <TIME>" },
      { summary: "Interview: <NAME> at" },
    );

    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });
});

describe("the CalDAV mirror this branch writes and reads back", () => {
  it("returns no stale mapping for the mirror it just wrote", () => {
    const description = "<div>Weekly sync</div>"
      + "<a href=\"https://teams.microsoft.com/l/meetup-join/19%3ax?context=y\">"
      + "Click here to join the meeting\n";

    expect(reconcile(
      { description },
      { description: roundTripThroughCalDAV(description) },
    ).staleMappingIds).toEqual([]);
  });

  it("does not churn forever", () => {
    const description =
      "<p>&lt;p&gt;&amp;lt;p&amp;gt;&amp;amp;lt;br&amp;amp;gt;&amp;lt;/p&amp;gt;&lt;/p&gt;</p>";

    const result = reconcile(
      { description },
      { description: roundTripThroughCalDAV(description) },
    );

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
  });
});
