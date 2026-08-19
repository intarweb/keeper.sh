interface FlushGenerationTracker {
  read: (calendarId: string) => number;
  bump: (calendarId: string) => void;
}

/*
 * Reaches only the writers sharing this instance. services/api persists CalDAV
 * sources from its own container, so catching it needs a marker both writers
 * read inside the transaction, not a counter.
 */
const createFlushGenerationTracker = (): FlushGenerationTracker => {
  const generations = new Map<string, number>();

  const read = (calendarId: string): number => generations.get(calendarId) ?? 0;

  return {
    read,
    bump: (calendarId: string): void => {
      generations.set(calendarId, read(calendarId) + 1);
    },
  };
};

export { createFlushGenerationTracker };
export type { FlushGenerationTracker };
