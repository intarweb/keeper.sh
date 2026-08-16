import type { Capabilities } from "@keeper.sh/sync-protocol";

const googleCapabilities = {
  provider: "google",
  delta: { kind: "tokenized", windowBoundToCursor: true },
  deletionAuthority: "snapshotAbsence",
  removalsAreAmbiguous: false,
  precondition: "matchesVersion",
  provenanceChannel: "extendedProperty",
  quotaScope: "perUser",
  throttleSignals: [
    { status: 403, hasRetryAfter: false },
    { status: 429, hasRetryAfter: true },
  ],
  representableRange: {
    minimumSpanSeconds: 0,
    zeroDuration: "reject",
    invertedRange: "reject",
    allDayGrid: "utcDay",
  },
  allDay: "dateOnly",
  recurrenceWrite: "rfc5545",
  echoesWrites: true,
} as const satisfies Capabilities<"google">;

export { googleCapabilities };
