import { COLUMN_COUNT, WEEKS_EACH_WAY } from "./constants";

interface MonthSpan {
  month: number;
  year: number;
  startCol: number;
  endCol: number;
}

const getStartDate = () => {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const weeksBefore = WEEKS_EACH_WAY * COLUMN_COUNT;
  return new Date(today.getFullYear(), today.getMonth(), 1 - firstOfMonth.getDay() - weeksBefore);
};

const getDateForCell = (startDate: Date, rowIndex: number, colIndex: number) => {
  const daysFromStart = rowIndex * COLUMN_COUNT + colIndex;
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + daysFromStart);
  return date;
};

const getRowDates = (startDate: Date, rowIndex: number) =>
  Array.from({ length: COLUMN_COUNT }, (_, colIndex) =>
    getDateForCell(startDate, rowIndex, colIndex)
  );

const MS_PER_DAY = 86_400_000;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getRowIndexForDate = (startDate: Date, date: Date) => {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysFromStart = Math.round((startOfDay.getTime() - startDate.getTime()) / MS_PER_DAY);
  return Math.floor(daysFromStart / COLUMN_COUNT);
};

const groupDatesByMonth = (dates: Date[]): MonthSpan[] => {
  const spans: MonthSpan[] = [];
  let currentSpan: MonthSpan | null = null;

  dates.forEach((date, colIndex) => {
    const month = date.getMonth();
    const year = date.getFullYear();

    if (!currentSpan || currentSpan.month !== month || currentSpan.year !== year) {
      if (currentSpan) spans.push(currentSpan);
      currentSpan = { month, year, startCol: colIndex, endCol: colIndex };
    } else {
      currentSpan.endCol = colIndex;
    }
  });

  if (currentSpan) spans.push(currentSpan);
  return spans;
};

export type { MonthSpan };
export { getStartDate, getDateForCell, getRowDates, getRowIndexForDate, groupDatesByMonth, isSameDay };
