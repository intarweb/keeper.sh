import type { calendar_v3 } from "@googleapis/calendar";
import { unimplemented } from "../unimplemented";

interface CollapsedRevisions {
  readonly winners: readonly calendar_v3.Schema$Event[];
  readonly losers: number;
}

const collapseRevisions = (
  items: readonly calendar_v3.Schema$Event[],
): CollapsedRevisions => unimplemented(items);

const revisionInstantOf = (item: calendar_v3.Schema$Event): number => unimplemented(item);

export { collapseRevisions, revisionInstantOf };
export type { CollapsedRevisions };
