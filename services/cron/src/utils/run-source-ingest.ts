import type { CalendarBackoffState } from "@keeper.sh/calendar";

interface SourceIngestAttempt {
  failureCount: number;
  nextAttemptAt: Date | null;
}

interface SourceIngestLease {
  isCurrent: () => Promise<boolean>;
  release: () => Promise<void>;
}

interface SourceIngestDependencies {
  acquireLease: (calendarId: string, signal: AbortSignal) => Promise<SourceIngestLease | null>;
  applyBackoff: (calendarId: string, currentFailureCount: number) => Promise<CalendarBackoffState>;
  readAttempt: (calendarId: string) => Promise<SourceIngestAttempt | null>;
  recordBackoff: (state: CalendarBackoffState) => void;
  resetBackoff: (calendarId: string) => Promise<void>;
}

const isAttemptDue = (attempt: SourceIngestAttempt, now: Date): boolean =>
  attempt.nextAttemptAt === null || attempt.nextAttemptAt <= now;

const runSourceIngest = async <TResult>(
  dependencies: SourceIngestDependencies,
  calendarId: string,
  signal: AbortSignal,
  work: (isCurrent: () => Promise<boolean>) => Promise<TResult>,
): Promise<TResult | null> => {
  const lease = await dependencies.acquireLease(calendarId, signal);
  if (!lease) {
    signal.throwIfAborted();
    return null;
  }

  try {
    const attempt = await dependencies.readAttempt(calendarId);
    if (!attempt || !isAttemptDue(attempt, new Date())) {
      return null;
    }

    try {
      const result = await work(lease.isCurrent);
      if (attempt.failureCount > 0 && await lease.isCurrent()) {
        await dependencies.resetBackoff(calendarId);
      }
      return result;
    } catch (error) {
      dependencies.recordBackoff(await dependencies.applyBackoff(calendarId, attempt.failureCount));
      throw error;
    }
  } finally {
    await lease.release();
  }
};

export { isAttemptDue, runSourceIngest };
export type { SourceIngestAttempt, SourceIngestDependencies, SourceIngestLease };
