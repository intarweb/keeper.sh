import type {
  CalendarKey,
  ChangeListing,
  CoverageWindow,
  Fingerprint,
  ListingScope,
  Result,
  WithheldIdentity,
  WithholdReason,
} from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { EventIdentity } from "../parse/identity";

const feedFreshnesses = ["changed", "unchanged"] as const;
type FeedFreshness = (typeof feedFreshnesses)[number];

interface UnsupportedEvent {
  readonly identity: WithheldIdentity;
  readonly reason: WithholdReason;
}

interface IcsFeedRequest {
  readonly body: string;
  readonly scope: ListingScope;
  readonly previousContentHash: Fingerprint | null;
  readonly options: IcsOptions;
}

interface IcsFeedProjection {
  readonly listing: Extract<ChangeListing, { kind: "snapshot" }>;
  readonly contentHash: Fingerprint;
  readonly freshness: FeedFreshness;
  readonly present: readonly EventIdentity[];
  readonly usable: readonly EventIdentity[];
  readonly unsupported: readonly UnsupportedEvent[];
}

const projectIcsFeed = (_request: IcsFeedRequest): Result<IcsFeedProjection> => {
  throw new Error("unimplemented");
};

const coverageForWholeFeed = (_calendar: CalendarKey): CoverageWindow => {
  throw new Error("unimplemented");
};

export { coverageForWholeFeed, feedFreshnesses, projectIcsFeed };
export type { FeedFreshness, IcsFeedProjection, IcsFeedRequest, UnsupportedEvent };
