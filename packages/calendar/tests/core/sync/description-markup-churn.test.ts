import { describe, expect, it } from "vitest";
import { computeSyncOperations } from "../../../src/core/sync/operations";
import type { ReconciliationScope } from "../../../src/core/sync/operations";
import {
  createEditableEventContentSnapshot,
  createSyncEventContentHash,
  hashEditableEventContentSnapshot,
} from "../../../src/core/events/content-hash";
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
  remoteDescription: string,
): RemoteEvent => {
  const content = createEditableEventContentSnapshot({
    ...event,
    description: remoteDescription,
  });
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

const reconcile = (event: MaterializedSyncableEvent, remoteDescription: string) => {
  const mapping = createMapping(event);
  return computeSyncOperations(
    [event],
    [mapping],
    [createRemoteEvent(event, mapping, remoteDescription)],
    SCOPE,
  );
};

describe("computeSyncOperations against a linkified description echo", () => {
  it("does not churn when the provider linkifies bare URLs, anchor text equal to href", () => {
    const event = createLocalEvent();
    const remoteDescription = `s: ${linkify(MEET_URL, MEET_URL)}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, SUPPORT_URL)}`;

    const result = reconcile(event, remoteDescription);

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(0);
    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(0);
  });

  it("does not churn when the provider truncates the anchor text", () => {
    const event = createLocalEvent();
    const remoteDescription = `s: ${linkify(MEET_URL, "tel.meet/xxx-xxx-xxx")}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, "support.google.com")}`;

    const result = reconcile(event, remoteDescription);

    expect(result.staleMappingIds).toEqual([]);
    expect(result.operations).toEqual([]);
    expect(result.staleReasonCounts.remoteContentChanged).toBe(0);
  });

  it("counts a markup-only convergence so the metric can be read after the change", () => {
    const event = createLocalEvent();
    const remoteDescription = `s: ${linkify(MEET_URL, MEET_URL)}`
      + `  Learn more about Meet at: ${linkify(SUPPORT_URL, SUPPORT_URL)}`;

    const result = reconcile(event, remoteDescription);

    expect(result.staleReasonCounts.remoteContentMarkupOnlyChanged).toBe(1);
  });

  it("still replaces when the provider truncated the description mid-word", () => {
    const event = createLocalEvent();

    const result = reconcile(event, LOCAL_DESCRIPTION.slice(0, 60));

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces when a word is added, removed or reordered", () => {
    const event = createLocalEvent({ description: "one two three" });

    expect(reconcile(event, "one two three four").staleMappingIds).toEqual(["mapping-id-1"]);
    expect(reconcile(event, "one three").staleMappingIds).toEqual(["mapping-id-1"]);
    expect(reconcile(event, "one three two").staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces when the anchor points somewhere else", () => {
    const event = createLocalEvent({ description: `Join: ${MEET_URL}` });
    const elsewhere = "https://tel.meet/yyy-yyy-yyy?pin=999&hs=2";

    const result = reconcile(event, `Join: ${linkify(elsewhere, elsewhere)}`);

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });

  it("still replaces when the line count changes", () => {
    const event = createLocalEvent({ description: "line one\nline two" });

    const result = reconcile(event, "line one\nline two\nline three");

    expect(result.staleReasonCounts.remoteContentDescriptionChanged).toBe(1);
    expect(result.staleMappingIds).toEqual(["mapping-id-1"]);
  });
});
