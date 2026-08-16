import { unimplemented } from "../unimplemented";

interface SingleFlight<Value> {
  readonly run: (key: string, lead: () => Promise<Value>) => Promise<Value>;
  readonly inFlightKeys: () => readonly string[];
}

const createSingleFlight = <Value>(): SingleFlight<Value> => unimplemented();

const orderedKeys = (keys: readonly string[]): readonly string[] => unimplemented(keys);

export { createSingleFlight, orderedKeys };
export type { SingleFlight };
