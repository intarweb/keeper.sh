import type { Instant } from "@keeper.sh/sync-protocol";
import type { TestClock } from "./options";

interface TestClockOptions {
  readonly start: Instant;
}

const createTestClock = (options: TestClockOptions): TestClock => {
  throw new Error(`unimplemented: createTestClock(${options.start.value})`);
};

export { createTestClock };
export type { TestClockOptions };
