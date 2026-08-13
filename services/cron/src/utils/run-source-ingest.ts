import type { CalendarBackoffState } from "@keeper.sh/calendar";
import { widelog } from "@/utils/logging";

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
  applyBackoff: (
    calendarId: string,
    currentFailureCount: number,
  ) => Promise<CalendarBackoffState | null>;
  readAttempt: (calendarId: string) => Promise<SourceIngestAttempt | null>;
  recordBackoff: (state: CalendarBackoffState) => void;
  resetBackoff: (calendarId: string) => Promise<void>;
}

const isAttemptDue = (attempt: SourceIngestAttempt, now: Date): boolean =>
  attempt.nextAttemptAt === null || attempt.nextAttemptAt <= now;

const isSameAttempt = (left: SourceIngestAttempt, right: SourceIngestAttempt): boolean =>
  left.failureCount === right.failureCount
  && (left.nextAttemptAt?.getTime() ?? null) === (right.nextAttemptAt?.getTime() ?? null);

const settleSuccess = async (
  dependencies: SourceIngestDependencies,
  calendarId: string,
  attempt: SourceIngestAttempt,
  lease: SourceIngestLease,
): Promise<void> => {
  if (attempt.failureCount === 0) {
    return;
  }

  try {
    if (await lease.isCurrent()) {
      await dependencies.resetBackoff(calendarId);
    }
  } catch (error) {
    widelog.error("retry.reset_error", error);
  }
};

const settleFailure = async (
  dependencies: SourceIngestDependencies,
  calendarId: string,
  attempt: SourceIngestAttempt,
): Promise<void> => {
  try {
    const current = await dependencies.readAttempt(calendarId);
    if (!current || !isSameAttempt(current, attempt)) {
      widelog.set("retry.backoff_skipped", "attempt-state-changed");
      return;
    }

    const state = await dependencies.applyBackoff(calendarId, attempt.failureCount);
    if (!state) {
      widelog.set("retry.backoff_skipped", "attempt-state-changed");
      return;
    }

    dependencies.recordBackoff(state);
  } catch (error) {
    widelog.error("retry.backoff_error", error);
  }
};

const runWork = async <TResult>(
  dependencies: SourceIngestDependencies,
  calendarId: string,
  attempt: SourceIngestAttempt,
  lease: SourceIngestLease,
  work: (isCurrent: () => Promise<boolean>) => Promise<TResult>,
): Promise<TResult> => {
  try {
    return await work(lease.isCurrent);
  } catch (error) {
    await settleFailure(dependencies, calendarId, attempt);
    throw error;
  }
};

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

    const result = await runWork(dependencies, calendarId, attempt, lease, work);
    await settleSuccess(dependencies, calendarId, attempt, lease);
    return result;
  } finally {
    await lease.release();
  }
};

export { isAttemptDue, runSourceIngest };
export type { SourceIngestAttempt, SourceIngestDependencies, SourceIngestLease };
