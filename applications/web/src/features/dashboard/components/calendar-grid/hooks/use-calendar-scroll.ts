import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useRowStride, useSetScrollOffset, useSetScrollDirection } from "../state/calendar-grid-state";
import { getRowIndexForDate } from "../utils/date-utils";
import { COLUMN_COUNT, GAP, VISIBLE_COLUMNS, VISIBLE_ROWS } from "../utils/constants";

interface UseCalendarScrollOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  weekColumnRef: RefObject<HTMLDivElement | null>;
  monthRowRef: RefObject<HTMLDivElement | null>;
  dayHeaderRef: RefObject<HTMLDivElement | null>;
  startDate: Date;
}

const useCalendarScroll = ({
  scrollRef,
  weekColumnRef,
  monthRowRef,
  dayHeaderRef,
  startDate,
}: UseCalendarScrollOptions) => {
  const setScrollOffset = useSetScrollOffset();
  const setScrollDirection = useSetScrollDirection();
  const rowStride = useRowStride();
  const prevScrollTop = useRef(0);
  const hasAnchoredToToday = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => {
      const scrollTop = element.scrollTop;
      setScrollOffset(scrollTop);
      if (scrollTop !== prevScrollTop.current) {
        setScrollDirection(scrollTop > prevScrollTop.current ? "down" : "up");
        prevScrollTop.current = scrollTop;
      }
      if (weekColumnRef.current) {
        weekColumnRef.current.style.transform = `translateY(${-scrollTop}px)`;
      }

      const horizontalShift = `translateX(${-element.scrollLeft}px)`;
      if (monthRowRef.current) monthRowRef.current.style.transform = horizontalShift;
      if (dayHeaderRef.current) dayHeaderRef.current.style.transform = horizontalShift;
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => element.removeEventListener("scroll", onScroll);
  }, [scrollRef, weekColumnRef, monthRowRef, dayHeaderRef, setScrollOffset, setScrollDirection]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || hasAnchoredToToday.current || rowStride <= GAP) return;
    hasAnchoredToToday.current = true;

    const today = new Date();
    const rowsAboveToday = Math.floor((VISIBLE_ROWS - 1) / 2);
    element.scrollTop = Math.max(0, getRowIndexForDate(startDate, today) - rowsAboveToday) * rowStride;

    const columnWidth = element.clientWidth / VISIBLE_COLUMNS;
    const columnsBeforeToday = Math.floor((VISIBLE_COLUMNS - 1) / 2);
    const firstColumn = Math.min(
      Math.max(0, today.getDay() - columnsBeforeToday),
      COLUMN_COUNT - VISIBLE_COLUMNS
    );
    element.scrollLeft = firstColumn * columnWidth;
  }, [scrollRef, startDate, rowStride]);
};

export { useCalendarScroll };
