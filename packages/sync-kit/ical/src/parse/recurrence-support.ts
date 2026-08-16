import type { EventUid } from "@keeper.sh/sync-protocol";
import type { IcsLimits } from "../options";

const detectEventLevelRecurrenceDates = (
  _body: string,
  _limits: IcsLimits): readonly EventUid[] => {
  throw new Error("unimplemented");
};

const detectRecurrenceRangeOverrides = (_body: string, _limits: IcsLimits): readonly EventUid[] => {
  throw new Error("unimplemented");
};

export { detectEventLevelRecurrenceDates, detectRecurrenceRangeOverrides };
