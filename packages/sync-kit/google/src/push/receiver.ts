const pushRejections = ["unknownChannel", "badToken", "missingHeaders", "unknownState"] as const;
type PushRejection = (typeof pushRejections)[number];

type PushSignal =
  | { readonly kind: "handshake" }
  | { readonly kind: "changed"; readonly channelId: string; readonly resourceId: string }
  | { readonly kind: "unrecognised"; readonly reason: PushRejection };

const changedStates = new Set(["exists", "not_exists", "update"]);

const namedHeader = (headers: Headers, name: string): string | null => {
  const value = headers.get(name);
  if (value === null || value.length === 0) {
    return null;
  }
  return value;
};

const decodePushSignal = (headers: Headers): PushSignal => {
  const channelId = namedHeader(headers, "X-Goog-Channel-ID");
  const resourceId = namedHeader(headers, "X-Goog-Resource-ID");
  const state = namedHeader(headers, "X-Goog-Resource-State");
  if (channelId === null || resourceId === null || state === null) {
    return { kind: "unrecognised", reason: "missingHeaders" };
  }
  if (state === "sync") {
    return { kind: "handshake" };
  }
  if (!changedStates.has(state)) {
    return { kind: "unrecognised", reason: "unknownState" };
  }
  return { kind: "changed", channelId, resourceId };
};

export { decodePushSignal, pushRejections };
export type { PushRejection, PushSignal };
