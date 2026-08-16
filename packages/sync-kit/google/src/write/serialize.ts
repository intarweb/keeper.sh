import type { calendar_v3 } from "@googleapis/calendar";
import type { InstallationId, NormalizedContent } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const serializeEvent = (
  content: NormalizedContent<"google">,
  installation: InstallationId,
): calendar_v3.Schema$Event => unimplemented(content, installation);

export { serializeEvent };
