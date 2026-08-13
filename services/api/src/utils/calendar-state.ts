const RECONNECTED_SOURCE_INGEST_STATE = {
  ingestFailureCount: 0,
  ingestLastFailureAt: null,
  ingestNextAttemptAt: null,
} as const;

const RECONNECTED_CALENDAR_STATE = {
  disabled: false,
  failureCount: 0,
  lastFailureAt: null,
  nextAttemptAt: null,
  ...RECONNECTED_SOURCE_INGEST_STATE,
} as const;

const buildReconnectedCalendarState = (calendarUrl: string) => ({
  calendarUrl,
  ...RECONNECTED_CALENDAR_STATE,
});

export {
  buildReconnectedCalendarState,
  RECONNECTED_CALENDAR_STATE,
  RECONNECTED_SOURCE_INGEST_STATE,
};
