import type { RefObject } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useFocusedRowIndex, useIsMeasured, useScrollDirection } from "../state/calendar-grid-state";
import { getRowDates, groupDatesByMonth } from "../utils/date-utils";
import { MONTH_NAMES, COLUMN_COUNT, TRACK_WIDTH_PERCENT } from "../utils/constants";

interface MonthRowProps {
  startDate: Date;
  monthRowRef: RefObject<HTMLDivElement | null>;
}

export function MonthRow({ startDate, monthRowRef }: MonthRowProps) {
  const focusedRowIndex = useFocusedRowIndex();
  const scrollDirection = useScrollDirection();
  const isMeasured = useIsMeasured();
  const monthSpans = isMeasured ? groupDatesByMonth(getRowDates(startDate, focusedRowIndex)) : [];

  const yOffset = scrollDirection === "down" ? 16 : -16;

  return (
    <div className="relative h-4 overflow-hidden">
      <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-border-elevated" />
      <div ref={monthRowRef} className="absolute inset-y-0 left-0" style={{ width: `${TRACK_WIDTH_PERCENT}%` }}>
      <AnimatePresence initial={false}>
        {monthSpans.map((span) => {
          const centerCol = (span.startCol + span.endCol) / 2;
          const leftPercent = ((centerCol + 0.5) / COLUMN_COUNT) * 100;
          const label = `${MONTH_NAMES[span.month]!.toUpperCase()}'${span.year.toString().slice(-2)}`;

          return (
            <m.span
              key={`${span.year}-${span.month}-${leftPercent}`}
              initial={{ y: yOffset, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -yOffset, opacity: 0 }}
              transition={{ duration: 0.16 }}
              style={{ left: `${leftPercent}%` }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <span className="block text-[10px] text-foreground-muted leading-none px-1 bg-background rounded-full whitespace-nowrap">
                {label}
              </span>
            </m.span>
          );
        })}
      </AnimatePresence>
      </div>
    </div>
  );
}
