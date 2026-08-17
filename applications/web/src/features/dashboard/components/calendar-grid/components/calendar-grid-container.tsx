import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import { useCalendarScroll } from "../hooks/use-calendar-scroll";
import { getRowIndexForDate } from "../utils/date-utils";
import { CalendarScrollArea } from "./calendar-scroll-area";
import { CalendarVirtualRows } from "./calendar-virtual-rows";
import { WeekColumn } from "./week-column";

interface CalendarGridContainerProps {
  weekColumnRef: RefObject<HTMLDivElement | null>;
  monthRowRef: RefObject<HTMLDivElement | null>;
  dayHeaderRef: RefObject<HTMLDivElement | null>;
  startDate: Date;
}

export function CalendarGridContainer({
  weekColumnRef,
  monthRowRef,
  dayHeaderRef,
  startDate,
}: CalendarGridContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRowIndex = useMemo(() => getRowIndexForDate(startDate, new Date()), [startDate]);
  useCalendarScroll({ scrollRef, weekColumnRef, monthRowRef, dayHeaderRef, startDate });

  return (
    <>
      <WeekColumn weekColumnRef={weekColumnRef} todayRowIndex={todayRowIndex} />
      <div className="absolute inset-0 bg-border-elevated rounded-2xl p-px overflow-hidden">
        <CalendarScrollArea scrollRef={scrollRef}>
          <CalendarVirtualRows startDate={startDate} />
        </CalendarScrollArea>
      </div>
    </>
  );
}
