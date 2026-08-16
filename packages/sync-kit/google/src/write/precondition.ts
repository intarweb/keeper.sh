import type { ObservedPrecondition, RemoteVersion } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const ifMatchHeader = (precondition: ObservedPrecondition): Record<string, string> =>
  unimplemented(precondition);

const versionOfEtagHeader = (etag: string | null): RemoteVersion | null => unimplemented(etag);

export { ifMatchHeader, versionOfEtagHeader };
