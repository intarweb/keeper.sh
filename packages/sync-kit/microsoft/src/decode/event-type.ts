import { unimplemented } from "../unimplemented";

const graphEventTypes = ["singleInstance", "occurrence", "exception", "seriesMaster"] as const;
type GraphEventType = (typeof graphEventTypes)[number];

type EventTypeReading =
  | { readonly kind: "known"; readonly type: GraphEventType }
  | { readonly kind: "absent" }
  | { readonly kind: "unknown"; readonly presented: string };

const readEventType = (presented: unknown): EventTypeReading => unimplemented(presented);

export { graphEventTypes, readEventType };
export type { EventTypeReading, GraphEventType };
