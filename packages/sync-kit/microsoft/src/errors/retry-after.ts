import type { Instant } from "@keeper.sh/sync-protocol";
import type { MicrosoftClock } from "../dependencies";
import { unimplemented } from "../unimplemented";

interface RetryAfterOptions {
  readonly clock: MicrosoftClock;
  readonly ceilingMs: number;
}

const retryAfterInstant = (
  header: string | null,
  options: RetryAfterOptions,
): Instant | null => unimplemented(header, options);

const retryAfterMilliseconds = (header: string | null, options: RetryAfterOptions): number | null =>
  unimplemented(header, options);

export { retryAfterInstant, retryAfterMilliseconds };
export type { RetryAfterOptions };
