import type { EchoVerdict, NormalizedContent } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

const echoVerdictOf = (
  submitted: NormalizedContent<"microsoft">,
  readBack: GraphEvent | null,
): EchoVerdict => unimplemented(submitted, readBack);

export { echoVerdictOf };
