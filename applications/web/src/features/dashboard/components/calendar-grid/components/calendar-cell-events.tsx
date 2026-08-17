import { memo } from "react";
import type { PlaceholderEvent } from "../utils/placeholder-events";

const SOURCE_COLORS = ["bg-emerald-400", "bg-sky-400", "bg-amber-400"];
const SOURCE_NAMES = ["Work", "Personal", "Family"];

const resolveSourceColor = (sourceIndex: number) =>
  SOURCE_COLORS[sourceIndex % SOURCE_COLORS.length];

const resolveSourceName = (sourceIndex: number) =>
  SOURCE_NAMES[sourceIndex % SOURCE_NAMES.length];

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
};

const byStartTime = (a: PlaceholderEvent, b: PlaceholderEvent) => a.startMinutes - b.startMinutes;

interface CalendarCellEventsProps {
  events: PlaceholderEvent[];
  isFocusedMonth: boolean;
}

export const CalendarCellEvents = memo(function CalendarCellEvents({
  events,
  isFocusedMonth,
}: CalendarCellEventsProps) {
  if (events.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-1.5 min-h-0 flex-1 overflow-hidden data-dimmed:opacity-40"
      data-dimmed={isFocusedMonth ? undefined : ""}
    >
      {[...events].sort(byStartTime).map((event) => (
        <div key={event.id} className="flex gap-1.5 shrink-0">
          <div className={`w-0.5 shrink-0 self-stretch rounded-full ${resolveSourceColor(event.sourceIndex)}`} />
          <div className="min-w-0">
            <p className="text-[10px] leading-tight tabular-nums text-foreground">
              {formatMinutes(event.startMinutes)}
            </p>
            <p className="text-[10px] leading-tight text-foreground-muted truncate">
              {resolveSourceName(event.sourceIndex)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
});
