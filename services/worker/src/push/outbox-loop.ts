import type { PushProcessorResult } from "./outbox-processor";

interface PushProcessor {
  processOnce(): Promise<PushProcessorResult>;
}

interface PushOutboxLoopOptions {
  intervalMs: number;
  onError?: (error: unknown) => void;
  processor: PushProcessor;
}

interface PushOutboxLoop {
  stop(): Promise<void>;
}

const startPushOutboxLoop = (options: PushOutboxLoopOptions): PushOutboxLoop => {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const tick = (): void => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = options.processor.processOnce()
      .then(() => globalThis.undefined)
      .catch((error: unknown) => {
        options.onError?.(error);
      })
      .finally(() => {
        inFlight = null;
      });
  };

  tick();
  const timer = setInterval(tick, options.intervalMs);

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
};

export { startPushOutboxLoop };
export type { PushOutboxLoop, PushOutboxLoopOptions };
