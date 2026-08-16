import type { calendar_v3 } from "@googleapis/calendar";
import type { EchoVerdict, NormalizedContent } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const echoVerdict = (
  submitted: NormalizedContent<"google">,
  returned: calendar_v3.Schema$Event | null,
  hash: (input: string) => string,
): EchoVerdict => unimplemented(submitted, returned, hash);

export { echoVerdict };
