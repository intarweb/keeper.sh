import type { OperationContext, RemoteEventId } from "@keeper.sh/sync-protocol";
import type { MicrosoftFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";

type SeriesExpansion =
  | { readonly kind: "expanded"; readonly instances: readonly unknown[] }
  | { readonly kind: "empty" }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure };

interface ExpandOptions {
  readonly master: RemoteEventId;
  readonly context: OperationContext;
  readonly fetchInstances: (master: RemoteEventId) => Promise<SeriesExpansion>;
}

const expandSeries = (options: ExpandOptions): Promise<SeriesExpansion> => unimplemented(options);

export { expandSeries };
export type { ExpandOptions, SeriesExpansion };
