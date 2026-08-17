export const COLUMN_COUNT = 7;
export const VISIBLE_COLUMNS = 4;
export const TRACK_WIDTH_PERCENT = (COLUMN_COUNT / VISIBLE_COLUMNS) * 100;
export const VISIBLE_ROWS = 1;
export const OVERSCAN_ROWS = 2;
export const GAP = 1;
export const WEEKS_EACH_WAY = 5200;
export const ROW_COUNT = WEEKS_EACH_WAY * 2 + 1;

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
