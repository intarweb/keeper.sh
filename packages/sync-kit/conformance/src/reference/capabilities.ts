import type { Capabilities } from "@keeper.sh/sync-protocol";

const referenceCapabilities: Capabilities<"reference"> = {
  provider: "reference",
  delta: { kind: "tokenized", windowBoundToCursor: true },
  deletionAuthority: "snapshotAbsence",
  removalsAreAmbiguous: false,
  precondition: "matchesVersion",
  provenanceChannel: "extendedProperty",
  quotaScope: "perUser",
  throttleSignals: [{ status: 429, hasRetryAfter: true }],
  representableRange: {
    minimumSpanSeconds: 0,
    zeroDuration: "accept",
    invertedRange: "reject",
    allDayGrid: "utcDay",
  },
  allDay: "dateOnly",
  recurrenceWrite: "rfc5545",
  echoesWrites: true,
};

export { referenceCapabilities };
