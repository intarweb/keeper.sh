interface Semaphore {
  readonly withPermit: <Value>(signal: AbortSignal, body: () => Promise<Value>) => Promise<Value>;
  readonly available: () => number;
  readonly waiting: () => number;
}

class PermitAborted extends Error {
  constructor() {
    super("the caller was aborted while it waited for a permit");
    this.name = "PermitAborted";
  }
}

interface Waiter {
  readonly resume: () => void;
  readonly refuse: () => void;
}

const createSemaphore = (permits: number): Semaphore => {
  const queue: Waiter[] = [];
  let held = 0;

  const forget = (waiter: Waiter): void => {
    const position = queue.indexOf(waiter);
    if (position === -1) {
      return;
    }
    queue.splice(position, 1);
  };

  const release = (): void => {
    const next = queue.shift();
    if (!next) {
      held -= 1;
      return;
    }
    next.resume();
  };

  const runHolding = async <Value>(body: () => Promise<Value>): Promise<Value> => {
    try {
      return await body();
    } finally {
      release();
    }
  };

  const queued = <Value>(signal: AbortSignal, body: () => Promise<Value>): Promise<Value> => {
    const turn = Promise.withResolvers<null>();
    const listening = new AbortController();
    const waiter: Waiter = {
      resume: () => {
        listening.abort();
        turn.resolve(null);
      },
      refuse: () => {
        listening.abort();
        turn.reject(new PermitAborted());
      },
    };
    queue.push(waiter);
    signal.addEventListener(
      "abort",
      () => {
        forget(waiter);
        waiter.refuse();
      },
      { once: true, signal: listening.signal },
    );
    return turn.promise.then(() => runHolding(body));
  };

  return {
    withPermit: <Value>(signal: AbortSignal, body: () => Promise<Value>): Promise<Value> => {
      if (signal.aborted) {
        return Promise.reject(new PermitAborted());
      }
      if (held < permits) {
        held += 1;
        return runHolding(body);
      }
      return queued(signal, body);
    },
    available: () => permits - held,
    waiting: () => queue.length,
  };
};

export { createSemaphore, PermitAborted };
export type { Semaphore };
