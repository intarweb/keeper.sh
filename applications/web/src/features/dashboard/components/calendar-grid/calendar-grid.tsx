import { useMemo, useRef } from "react";
import { LazyMotion } from "motion/react";
import { loadMotionFeatures } from "@/lib/motion-features";
import { CalendarGridProvider } from "./contexts/calendar-grid-provider";
import { CalendarGridContainer } from "./components/calendar-grid-container";
import { DayHeaders } from "./components/day-headers";
import { MonthRow } from "./components/month-row";
import { getStartDate } from "./utils/date-utils";

function CalendarGridContent() {
  const weekColumnRef = useRef<HTMLDivElement>(null);
  const monthRowRef = useRef<HTMLDivElement>(null);
  const dayHeaderRef = useRef<HTMLDivElement>(null);
  const startDate = useMemo(() => getStartDate(), []);

  return (
    <div className="flex flex-col gap-2">
      <MonthRow startDate={startDate} monthRowRef={monthRowRef} />
      <div className="relative w-full h-72">
        <CalendarGridContainer
          weekColumnRef={weekColumnRef}
          monthRowRef={monthRowRef}
          dayHeaderRef={dayHeaderRef}
          startDate={startDate}
        />
      </div>
      <DayHeaders dayHeaderRef={dayHeaderRef} />
    </div>
  );
}

export function CalendarGrid() {
  return (
    <LazyMotion features={loadMotionFeatures}>
      <CalendarGridProvider>
        <CalendarGridContent />
      </CalendarGridProvider>
    </LazyMotion>
  );
}
