import type { NormalizedContent, Provenance } from "@keeper.sh/sync-protocol";
import type { ZoneCache } from "@keeper.sh/sync-ical";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

interface SerializeInputs {
  readonly content: NormalizedContent<"microsoft">;
  readonly provenance: Extract<Provenance, { kind: "ours" }> | null;
  readonly idempotencyKey: string | null;
  readonly preservedBody: string | null;
  readonly zones: ZoneCache;
}

const serializeForGraph = (inputs: SerializeInputs): GraphEvent => unimplemented(inputs);

export { serializeForGraph };
export type { SerializeInputs };
