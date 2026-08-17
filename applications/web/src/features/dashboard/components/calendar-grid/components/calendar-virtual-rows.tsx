import { useMemo } from "react";
import { CalendarRow } from "./calendar-row";
import {
  useFocusedRowIndex,
  useIsMeasured,
  useRowHeight,
  useRowStride,
  useTotalHeight,
  useVisibleRange,
} from "../state/calendar-grid-state";
import { getDateForCell } from "../utils/date-utils";
import { COLUMN_COUNT, TRACK_WIDTH_PERCENT } from "../utils/constants";

const MIDWEEK_COLUMN = Math.floor(COLUMN_COUNT / 2);

interface CalendarVirtualRowsProps {
  startDate: Date;
}

export function CalendarVirtualRows({ startDate }: CalendarVirtualRowsProps) {
  const { start, end } = useVisibleRange();
  const focusedRowIndex = useFocusedRowIndex();
  const rowHeight = useRowHeight();
  const rowStride = useRowStride();
  const totalHeight = useTotalHeight();
  const today = useMemo(() => new Date(), []);
  const isMeasured = useIsMeasured();

  const focusedMonth = getDateForCell(startDate, focusedRowIndex, MIDWEEK_COLUMN).getMonth();

  return (
    <div className="relative" style={{ height: `${totalHeight}px`, width: `${TRACK_WIDTH_PERCENT}%` }}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-x-3 inset-y-0" data-calendar-stripes />
      </div>
      {isMeasured && Array.from({ length: end - start }, (_, offset) => {
        const rowIndex = start + offset;
        return (
          <CalendarRow
            key={rowIndex}
            rowIndex={rowIndex}
            rowHeight={rowHeight}
            startY={rowIndex * rowStride}
            startDate={startDate}
            focusedMonth={focusedMonth}
            today={today}
          />
        );
      })}
    </div>
  );
}
