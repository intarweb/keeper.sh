import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleSyncProvider } from "../../../../src/providers/google/destination/provider";
import {
  parseRemoteStateEcho,
  serializeRemoteStateEcho,
} from "../../../../src/core/events/remote-echo";
import type { MaterializedSyncableEvent } from "../../../../src/core/types";

const batchMocks = vi.hoisted(() => ({
  executeBatchChunked: vi.fn(),
}));

vi.mock("../../../../src/providers/google/shared/batch", () => ({
  executeBatchChunked: batchMocks.executeBatchChunked,
}));

const createProvider = () => createGoogleSyncProvider({
  accessToken: "test-token",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
  calendarId: "cal-1",
  externalCalendarId: "primary",
  refreshToken: "test-refresh",
  userId: "user-1",
});

const EVENT: MaterializedSyncableEvent = {
  calendarId: "source-calendar",
  calendarName: "Source",
  calendarUrl: null,
  endTime: new Date("2026-03-15T10:00:00Z"),
  id: "event-state-id",
  sourceEventUid: "source-event-uid",
  startTime: new Date("2026-03-15T09:00:00Z"),
  summary: "Meeting",
};

/*
 * The echo written with a new mapping row is serialized from the times Google reports in
 * its import response. A dateTime Google returns that Date cannot parse must not reach
 * the row: an unreadable echo is a row no later run can compare against.
 */
describe("a Google import response whose dateTime does not parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const persistedEchoFor = async (dateTimes: {
    end: string;
    start: string;
  }): Promise<string | null> => {
    batchMocks.executeBatchChunked.mockResolvedValueOnce([{
      body: {
        end: { dateTime: dateTimes.end },
        id: "google-event-id",
        start: { dateTime: dateTimes.start },
        summary: "Meeting",
      },
      headers: {},
      statusCode: 200,
    }]);

    const [pushResult] = await createProvider().pushEvents([EVENT]);
    if (!pushResult?.success) {
      throw new Error("Expected a successful Google import");
    }
    if (typeof pushResult.editableContentHash !== "string") {
      return null;
    }
    return serializeRemoteStateEcho({
      availability: pushResult.storedAvailability ?? null,
      contentHash: pushResult.editableContentHash,
      endTime: pushResult.storedEndTime ?? null,
      startTime: pushResult.storedStartTime ?? null,
    });
  };

  it("records no echo rather than one that cannot be read back", async () => {
    const persisted = await persistedEchoFor({
      end: "2026-03-15T10:00:00+25:00",
      start: "2026-03-15T09:00:00+25:00",
    });

    expect(persisted).toBeNull();
  });

  it("still records an echo that round-trips when the times parse", async () => {
    const persisted = await persistedEchoFor({
      end: "2026-03-15T10:00:00Z",
      start: "2026-03-15T09:00:00Z",
    });

    expect(persisted).toBeTypeOf("string");
    expect(parseRemoteStateEcho(persisted)).toMatchObject({
      endSecond: Math.trunc(Date.UTC(2026, 2, 15, 10) / 1000),
      startSecond: Math.trunc(Date.UTC(2026, 2, 15, 9) / 1000),
    });
  });
});
