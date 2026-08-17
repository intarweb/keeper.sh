import type { RefObject } from "react";
import { Text } from "@/components/ui/primitives/text";
import { TRACK_WIDTH_PERCENT } from "../utils/constants";

const DAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

interface DayHeadersProps {
  dayHeaderRef: RefObject<HTMLDivElement | null>;
}

export function DayHeaders({ dayHeaderRef }: DayHeadersProps) {
  return (
    <div className="relative overflow-hidden">
      <div
        ref={dayHeaderRef}
        className="grid grid-cols-7 place-items-center"
        style={{ width: `${TRACK_WIDTH_PERCENT}%` }}
      >
        {DAY_LABELS.map((label) => (
          <Text key={label} size="xs" tone="muted" className="text-[10px] leading-none select-none">
            {label}
          </Text>
        ))}
      </div>
    </div>
  );
}
