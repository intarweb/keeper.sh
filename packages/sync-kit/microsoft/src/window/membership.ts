import type { WindowMembership } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const withinMicrosoftWindow: WindowMembership = (bounds, time) => unimplemented(bounds, time);

export { withinMicrosoftWindow };
