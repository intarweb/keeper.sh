import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

const isCancelled = (event: GraphEvent): boolean => unimplemented(event);

export { isCancelled };
