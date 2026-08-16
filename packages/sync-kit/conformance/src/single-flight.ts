interface SingleFlightOptions<Value> {
  readonly retain: (value: Value) => boolean;
}

interface SingleFlight<Value> {
  readonly run: (key: string, body: () => Promise<Value>) => Promise<Value>;
}

const createSingleFlight = <Value>(options: SingleFlightOptions<Value>): SingleFlight<Value> => {
  const flights = new Map<string, Promise<Value>>();

  const release = (key: string, started: Promise<Value>, settled: Value): Value => {
    if (options.retain(settled)) {
      return settled;
    }
    if (flights.get(key) === started) {
      flights.delete(key);
    }
    return settled;
  };

  const run = (key: string, body: () => Promise<Value>): Promise<Value> => {
    const joined = flights.get(key);
    if (joined) {
      return joined;
    }
    const started: Promise<Value> = body().then((settled) => release(key, started, settled));
    flights.set(key, started);
    return started;
  };

  return { run };
};

export { createSingleFlight };
export type { SingleFlight, SingleFlightOptions };
