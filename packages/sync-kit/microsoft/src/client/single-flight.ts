import { unimplemented } from "../unimplemented";

interface SingleFlight<Value> {
  readonly run: (
    key: string,
    lead: (signal: AbortSignal) => Promise<Value>,
    joiner: AbortSignal,
  ) => Promise<Value>;
  readonly inFlightKeys: () => readonly string[];
}

const createSingleFlight = <Value>(): SingleFlight<Value> => unimplemented();

export { createSingleFlight };
export type { SingleFlight };
