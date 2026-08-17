import { memo } from "react";
import { tv } from "tailwind-variants/lite";
import { useDayFraction } from "../hooks/use-day-fraction";
import { CalendarCellEvents } from "./calendar-cell-events";
import type { PlaceholderEvent } from "../utils/placeholder-events";

const cell = tv({
  base: "relative size-full px-2 py-1 flex flex-col gap-1.5 overflow-hidden border-r border-b border-border-elevated last:border-r-0 transition-colors duration-300",
  variants: {
    focused: {
      true: "bg-background",
      false: "bg-transparent",
    },
  },
});

const dayNumber = tv({
  base: "text-xs tabular-nums leading-none font-mono",
  variants: {
    focused: {
      true: "text-foreground",
      false: "text-foreground-disabled",
    },
  },
});

interface CalendarCellProps {
  day: number;
  isToday: boolean;
  isFocusedMonth: boolean;
  events: PlaceholderEvent[];
}

export const CalendarCell = memo(function CalendarCell({ day, isToday, isFocusedMonth, events }: CalendarCellProps) {
  return (
    <div className={cell({ focused: isFocusedMonth })}>
      <span className={dayNumber({ focused: isFocusedMonth })}>{day}</span>
      <CalendarCellEvents events={events} isFocusedMonth={isFocusedMonth} />
      {isToday && <NowLine />}
    </div>
  );
});

function NowLine() {
  const dayFraction = useDayFraction();
  if (dayFraction === null) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 h-px bg-red-500 before:content-[''] before:absolute before:-top-[2px] before:left-0 before:-translate-x-full before:size-[5px] before:rounded-full before:bg-red-500"
      style={{ top: `${dayFraction * 100}%` }}
    />
  );
}
