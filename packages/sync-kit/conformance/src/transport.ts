import type { OperationName, ProviderFailure } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { TransportBehaviour, TransportStub } from "./options";

class TransportRejection extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure) {
    super(`the injected transport answered with "${failure.kind}"`);
    this.name = "TransportRejection";
    this.failure = failure;
  }
}

class TransportThrew extends Error {
  constructor(operation: OperationName) {
    super(`the injected transport threw out of "${operation}"`);
    this.name = "TransportThrew";
  }
}

const remainingBehaviour = (behaviour: TransportBehaviour): TransportBehaviour => {
  if (behaviour.kind === "reject" && behaviour.times > 1) {
    return { ...behaviour, times: behaviour.times - 1 };
  }
  if (behaviour.kind === "throw" && behaviour.times > 1) {
    return { ...behaviour, times: behaviour.times - 1 };
  }
  if (behaviour.kind === "stall") {
    return behaviour;
  }
  return { kind: "pass" };
};

const createTransportStub = (): TransportStub => {
  let behaviour: TransportBehaviour = { kind: "pass" };
  let calls = 0;
  let inFlight = 0;
  let peak = 0;

  const track = async <Value>(execute: () => Promise<Value>): Promise<Value> => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      return await execute();
    } finally {
      inFlight -= 1;
    }
  };

  const run = <Value>(operation: OperationName, execute: () => Promise<Value>): Promise<Value> => {
    calls += 1;
    const current = behaviour;
    behaviour = remainingBehaviour(current);
    switch (current.kind) {
      case "pass": {
        return track(execute);
      }
      case "stall": {
        return Promise.withResolvers<Value>().promise;
      }
      case "reject": {
        return Promise.reject(new TransportRejection(current.failure));
      }
      case "throw": {
        throw new TransportThrew(operation);
      }
      default: {
        return assertNever(current);
      }
    }
  };

  return {
    run,
    callCount: () => calls,
    inFlightPeak: () => peak,
    stall: () => {
      behaviour = { kind: "stall" };
    },
    resume: () => {
      behaviour = { kind: "pass" };
    },
    answerWith: (next: TransportBehaviour) => {
      behaviour = next;
    },
  };
};

const failureOfTransportError = (error: unknown): ProviderFailure => {
  if (error instanceof TransportRejection) {
    return error.failure;
  }
  return { kind: "transport", status: null, disposition: "permanent" };
};

export { createTransportStub, failureOfTransportError, TransportRejection, TransportThrew };
