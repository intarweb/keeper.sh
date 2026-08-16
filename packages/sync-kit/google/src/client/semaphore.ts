import { unimplemented } from "../unimplemented";

interface Semaphore {
  readonly withPermit: <Value>(signal: AbortSignal, body: () => Promise<Value>) => Promise<Value>;
  readonly available: () => number;
  readonly waiting: () => number;
}

const createSemaphore = (permits: number): Semaphore => unimplemented(permits);

export { createSemaphore };
export type { Semaphore };
