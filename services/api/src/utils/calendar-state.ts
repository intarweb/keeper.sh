const RECONNECTED_BACKOFF_STATE = {
  failureCount: 0,
  lastFailureAt: null,
  nextAttemptAt: null,
  ingestFailureCount: 0,
  ingestLastFailureAt: null,
  ingestNextAttemptAt: null,
} as const;

const RECONNECTED_CALENDAR_STATE = {
  disabled: false,
  ...RECONNECTED_BACKOFF_STATE,
} as const;

const buildReconnectedCalendarState = (calendarUrl: string) => ({
  calendarUrl,
  ...RECONNECTED_CALENDAR_STATE,
});

export {
  buildReconnectedCalendarState,
  RECONNECTED_BACKOFF_STATE,
  RECONNECTED_CALENDAR_STATE,
};
