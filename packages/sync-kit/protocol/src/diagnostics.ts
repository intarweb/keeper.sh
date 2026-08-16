import type { EventUid, RemoteEventId } from "./handles";

type BoundedSample = readonly string[];

const withholdReasons = [
  "unparseable",
  "unresolvableTimeZone",
  "unrepresentableTime",
  "recurrenceBudgetExceeded",
  "supersededRevisionUnbuildable",
] as const;
type WithholdReason = (typeof withholdReasons)[number];

interface WithheldEvent {
  readonly uid: EventUid;
  readonly id: RemoteEventId | null;
  readonly reason: WithholdReason;
}

interface ListingDiagnostics {
  readonly withheld: BoundedSample;
  readonly unrepresentable: BoundedSample;
  readonly pagesFetched?: number;
}

export { withholdReasons };
export type { BoundedSample, ListingDiagnostics, WithheldEvent, WithholdReason };
