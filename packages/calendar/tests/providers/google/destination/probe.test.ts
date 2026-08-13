import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleSyncProvider } from "../../../../src/providers/google/destination/provider";

const HOUR_MS = 3_600_000;
const OK_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const GONE_STATUS = 410;

const UID = "abc123@keeper.sh";

const createProvider = () => createGoogleSyncProvider({
  accessToken: "test-token",
  accessTokenExpiresAt: new Date(Date.now() + HOUR_MS),
  calendarId: "cal-1",
  externalCalendarId: "primary",
  refreshToken: "test-refresh",
  userId: "user-1",
});

const probe = (): Promise<string> => {
  const provider = createProvider() as unknown as {
    probeRemoteEvent?: (
      reference: { deleteId: string; uid: string },
    ) => Promise<string>;
  };
  if (!provider.probeRemoteEvent) {
    throw new Error("The Google destination provider cannot confirm a copy is gone");
  }
  return provider.probeRemoteEvent({ deleteId: "google-event-id", uid: UID });
};

describe("Google destination: confirming a copy is really gone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports absent when the calendar answers with no live match", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(Response.json({ items: [] }, { status: OK_STATUS }))));

    await expect(probe()).resolves.toBe("absent");
  });

  it("reports present when the calendar still holds the copy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json(
      { items: [{ iCalUID: UID, id: "google-event-id", status: "confirmed" }] },
      { status: OK_STATUS },
    ))));

    await expect(probe()).resolves.toBe("present");
  });

  it.each([NOT_FOUND_STATUS, GONE_STATUS])(
    "refuses to read a collection answering %i as the copy being gone",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn(() =>
        Promise.resolve(new Response("{}", { status }))));

      await expect(probe()).rejects.toThrow();
    },
  );
});
