import type { EventTime, TimeWindow, WindowMembership } from "@keeper.sh/sync-protocol";

const withinTimeWindow = ((_window: TimeWindow, _time: EventTime): boolean => {
  throw new Error("unimplemented");
}) satisfies WindowMembership;

export { withinTimeWindow };
