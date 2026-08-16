import { describe, expect, test } from "vitest";
import { decodePushSignal } from "../../src/push/receiver";

const googleHeaders = (entries: Readonly<Record<string, string>>): Headers => new Headers(entries);

describe("a push notification is decoded totally, never trusted", () => {
  test("GOOG-P1: the first delivery is a handshake and never triggers an ingest", () => {
    const signal = decodePushSignal(
      googleHeaders({
        "X-Goog-Channel-ID": "channel-1",
        "X-Goog-Resource-ID": "resource-1",
        "X-Goog-Resource-State": "sync",
        "X-Goog-Message-Number": "1",
      }),
    );

    expect(signal).toEqual({ kind: "handshake" });
  });

  test("GOOG-P1: an exists notification names the channel and the resource", () => {
    const signal = decodePushSignal(
      googleHeaders({
        "X-Goog-Channel-ID": "channel-1",
        "X-Goog-Resource-ID": "resource-1",
        "X-Goog-Resource-State": "exists",
        "X-Goog-Message-Number": "2",
      }),
    );

    expect(signal).toEqual({ kind: "changed", channelId: "channel-1", resourceId: "resource-1" });
  });

  test("GOOG-P1: headers from the open internet decode rather than throw", () => {
    expect(decodePushSignal(googleHeaders({}))).toEqual({
      kind: "unrecognised",
      reason: "missingHeaders",
    });
    expect(
      decodePushSignal(
        googleHeaders({
          "X-Goog-Channel-ID": "channel-1",
          "X-Goog-Resource-ID": "resource-1",
          "X-Goog-Resource-State": "somethingGoogleNeverSent",
        }),
      ),
    ).toEqual({ kind: "unrecognised", reason: "unknownState" });
  });

  test("GOOG-P1: a notification carries no events, so it can never be coverage", () => {
    const signal = decodePushSignal(
      googleHeaders({
        "X-Goog-Channel-ID": "channel-1",
        "X-Goog-Resource-ID": "resource-1",
        "X-Goog-Resource-State": "exists",
      }),
    );

    expect(Object.keys(signal)).toEqual(["kind", "channelId", "resourceId"]);
  });
});
