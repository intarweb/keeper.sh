const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const REFRESH_BUFFER_MINUTES = 5;
const RATE_LIMIT_SECONDS = 60;

const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;
const MS_PER_WEEK = DAYS_PER_WEEK * MS_PER_DAY;

const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;

const TOOLTIP_CLEAR_DELAY_MS = 1500;
const TOAST_TIMEOUT_MS = 3000;
const WEBSOCKET_RECONNECT_DELAY_MS = 3000;
const TOKEN_TTL_MS = 30_000;
const TOKEN_REFRESH_BUFFER_MS = REFRESH_BUFFER_MINUTES * MS_PER_MINUTE;
const RATE_LIMIT_DELAY_MS = RATE_LIMIT_SECONDS * MS_PER_SECOND;
const SYNC_TTL_SECONDS = SECONDS_PER_DAY;

const PROVIDER_PUSH_REQUEST_TIMEOUT_MS = 30_000;
/*
 * Deliberately below SOURCE_INGEST_LOCK_TIMEOUT_MS: a write-back holds the source
 * ingest advisory lock, whose waiters error out rather than queue after 30 seconds.
 */
const TWO_WAY_SOURCE_WRITE_TIMEOUT_MS = 10_000;
const TWO_WAY_WRITE_BACK_PASS_BUDGET_MS = 20_000;
/*
 * A per-pass circuit breaker cannot see a slow leak: a couple of spurious deletions per
 * pass stays under its floor and still destroys thousands of real events in a day.
 */
const TWO_WAY_DELETE_DAILY_CAP = 50;
const TWO_WAY_DELETE_DAILY_WINDOW_MS = MS_PER_DAY;
/*
 * The hourly epoch budget has no cumulative memory, so an oscillation slower than its
 * threshold is handed a fresh budget every hour and writes to a real calendar forever.
 * This sits far above any plausible human editing rate for a single event and far below
 * the 1440 passes a Pro mapping runs in a day.
 */
const TWO_WAY_WRITE_BACK_DAILY_CAP = 20;
const TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS = MS_PER_DAY;
/*
 * How long an answer about vanished copies stays good for. Long enough for the passes it
 * takes to probe and delete them, short enough that the bulk breaker is armed again well
 * before anything else could go wrong unattended.
 */
const TWO_WAY_DELETE_APPROVAL_TTL_MS = 30 * MS_PER_MINUTE;
const PROVIDER_INGEST_REQUEST_TIMEOUT_MS = 90_000;
const INGEST_SOURCE_TIMEOUT_MS = 120_000;

const KEEPER_EVENT_SUFFIX = "@keeper.sh";
const KEEPER_USER_EVENT_SUFFIX = "@user.keeper.sh";
const KEEPER_CATEGORY = "keeper.sh";

export {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
  SECONDS_PER_MINUTE,
  SECONDS_PER_HOUR,
  SECONDS_PER_DAY,
  TOOLTIP_CLEAR_DELAY_MS,
  TOAST_TIMEOUT_MS,
  WEBSOCKET_RECONNECT_DELAY_MS,
  TOKEN_TTL_MS,
  TOKEN_REFRESH_BUFFER_MS,
  RATE_LIMIT_DELAY_MS,
  SYNC_TTL_SECONDS,
  PROVIDER_PUSH_REQUEST_TIMEOUT_MS,
  TWO_WAY_DELETE_APPROVAL_TTL_MS,
  TWO_WAY_DELETE_DAILY_CAP,
  TWO_WAY_DELETE_DAILY_WINDOW_MS,
  TWO_WAY_SOURCE_WRITE_TIMEOUT_MS,
  TWO_WAY_WRITE_BACK_DAILY_CAP,
  TWO_WAY_WRITE_BACK_DAILY_WINDOW_MS,
  TWO_WAY_WRITE_BACK_PASS_BUDGET_MS,
  PROVIDER_INGEST_REQUEST_TIMEOUT_MS,
  INGEST_SOURCE_TIMEOUT_MS,
  KEEPER_EVENT_SUFFIX,
  KEEPER_USER_EVENT_SUFFIX,
  KEEPER_CATEGORY,
};
