import type { calendar_v3 } from "@googleapis/calendar";
import { unimplemented } from "../unimplemented";

const googleEventStatuses = ["confirmed", "tentative", "cancelled"] as const;
type GoogleEventStatus = (typeof googleEventStatuses)[number];

const isCancelledItem = (item: calendar_v3.Schema$Event): boolean => unimplemented(item);

export { googleEventStatuses, isCancelledItem };
export type { GoogleEventStatus };
