import type { calendar_v3 } from "@googleapis/calendar";
import type { DeleteHandle, EventUid, RemoteEventId, RemoteVersion } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

interface DecodedIdentity {
  readonly id: RemoteEventId;
  readonly deleteHandle: DeleteHandle;
  readonly uid: EventUid | null;
  readonly version: RemoteVersion | null;
}

const decodeIdentity = (item: calendar_v3.Schema$Event): DecodedIdentity | null =>
  unimplemented(item);

const versionOfEtag = (etag: string | null | undefined): RemoteVersion | null => unimplemented(etag);

export { decodeIdentity, versionOfEtag };
export type { DecodedIdentity };
