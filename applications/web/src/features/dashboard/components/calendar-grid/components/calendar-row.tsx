import { memo } from "react";
import { CalendarCell } from "./calendar-cell";
import { COLUMN_COUNT } from "../utils/constants";
import { getDateForCell, isSameDay } from "../utils/date-utils";
import { getPlaceholderEvents } from "../utils/placeholder-events";

interface CalendarRowProps {
  rowIndex: number;
  rowHeight: number;
  startY: number;
  startDate: Date;
  focusedMonth: number;
  today: Date;
}

export const CalendarRow = memo(
  function CalendarRow({ rowIndex, rowHeight, startY, startDate, focusedMonth, today }: CalendarRowProps) {
    return (
      <div
        className="absolute left-0 right-0 grid grid-cols-7"
        style={{
          height: `${rowHeight}px`,
          transform: `translateY(${startY}px)`,
        }}
      >
        {Array.from({ length: COLUMN_COUNT }, (_, colIndex) => {
          const date = getDateForCell(startDate, rowIndex, colIndex);
          return (
            <CalendarCell
              key={colIndex}
              day={date.getDate()}
              isToday={isSameDay(date, today)}
              isFocusedMonth={date.getMonth() === focusedMonth}
              events={getPlaceholderEvents(date)}
            />
          );
        })}
      </div>
    );
  },
  (prev, next) =>
    prev.rowIndex === next.rowIndex &&
    prev.rowHeight === next.rowHeight &&
    prev.startY === next.startY &&
    prev.focusedMonth === next.focusedMonth &&
    prev.startDate.getTime() === next.startDate.getTime() &&
    prev.today.getTime() === next.today.getTime()
);
