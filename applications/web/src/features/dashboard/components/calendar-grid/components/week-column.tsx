import type { RefObject } from "react";
import { useRowHeight, useRowStride, useVisibleRange } from "../state/calendar-grid-state";

const formatWeekDelta = (weekDelta: number) => {
  if (weekDelta > 0) return `+${weekDelta}`;
  return `${weekDelta}`;
};

interface WeekColumnProps {
  weekColumnRef: RefObject<HTMLDivElement | null>;
  todayRowIndex: number;
}

export function WeekColumn({ weekColumnRef, todayRowIndex }: WeekColumnProps) {
  const { start, end } = useVisibleRange();
  const rowHeight = useRowHeight();
  const rowStride = useRowStride();

  return (
    <div className="absolute -left-7 top-0 bottom-0 w-7 overflow-hidden">
      <div ref={weekColumnRef} className="absolute inset-x-0">
        {Array.from({ length: end - start }, (_, offset) => {
          const rowIndex = start + offset;
          return (
            <div
              key={rowIndex}
              className="absolute left-0 right-0"
              style={{
                height: `${rowHeight}px`,
                transform: `translateY(${rowIndex * rowStride}px)`,
              }}
            >
              <div className="absolute -top-px left-1/2 h-[calc(50%+1px)] w-px -translate-x-1/2 bg-border-elevated" />
              <div className="absolute top-1/2 left-1/2 h-[calc(50%+1px)] w-px -translate-x-1/2 bg-border-elevated" />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-foreground-muted leading-none px-1 py-0.5 bg-background rounded-full tabular-nums">
                {formatWeekDelta(rowIndex - todayRowIndex)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
