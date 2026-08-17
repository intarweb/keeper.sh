import type { PropsWithChildren, RefObject } from "react";
import { useRowHeightSync } from "../hooks/use-row-height-sync";

interface CalendarScrollAreaProps {
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function CalendarScrollArea({ scrollRef, children }: PropsWithChildren<CalendarScrollAreaProps>) {
  useRowHeightSync(scrollRef);

  return (
    <div
      ref={scrollRef}
      data-hide-scrollbar
      className="size-full overflow-auto overscroll-contain bg-background rounded-[0.9375rem]"
    >
      {children}
    </div>
  );
}
