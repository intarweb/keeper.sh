import type { RemoteEvent } from "@keeper.sh/sync-protocol";
import type { SourceIdentity } from "./source-identity";

const observedSourceIdentity = (event: RemoteEvent): SourceIdentity | null => {
  throw new Error(`unimplemented: observedSourceIdentity(${event.id.value})`);
};

export { observedSourceIdentity };
