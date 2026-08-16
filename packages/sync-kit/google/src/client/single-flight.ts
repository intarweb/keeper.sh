import { compareCodeUnits } from "../canonical";

interface SingleFlight<Value> {
  readonly run: (key: string, lead: () => Promise<Value>) => Promise<Value>;
  readonly abandon: (key: string) => void;
  readonly inFlightKeys: () => readonly string[];
}

const createSingleFlight = <Value>(): SingleFlight<Value> => {
  const flights = new Map<string, Promise<Value>>();

  const forget = (key: string, started: Promise<Value>): void => {
    if (flights.get(key) !== started) {
      return;
    }
    flights.delete(key);
  };

  const run = (key: string, lead: () => Promise<Value>): Promise<Value> => {
    const joined = flights.get(key);
    if (joined) {
      return joined;
    }
    const started: Promise<Value> = lead().then(
      (settled) => {
        forget(key, started);
        return settled;
      },
      (error: unknown) => {
        forget(key, started);
        throw error;
      },
    );
    flights.set(key, started);
    return started;
  };

  return {
    run,
    abandon: (key: string) => {
      flights.delete(key);
    },
    inFlightKeys: () => [...flights.keys()],
  };
};

const orderedKeys = (keys: readonly string[]): readonly string[] =>
  [...new Set(keys)].toSorted(compareCodeUnits);

export { createSingleFlight, orderedKeys };
export type { SingleFlight };
