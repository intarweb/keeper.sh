import type { CalendarKey, EventTime, TimeWindow, WindowMembership } from "@keeper.sh/sync-protocol";

type ProvenCoverage =
  | { readonly kind: "unproven" }
  | {
      readonly kind: "proven";
      readonly calendar: CalendarKey;
      readonly historic: TimeWindow;
      readonly future: TimeWindow;
    };

const insideProvenCoverage = (
  coverage: ProvenCoverage,
  time: EventTime,
  withinWindow: WindowMembership,
): boolean => {
  throw new Error(`unimplemented: insideProvenCoverage(${coverage.kind}, ${time.kind}, ${withinWindow.name})`);
};

export { insideProvenCoverage };
export type { ProvenCoverage };
