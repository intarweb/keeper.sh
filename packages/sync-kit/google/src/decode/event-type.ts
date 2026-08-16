import type { Availability } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const googleEventTypes = [
  "default",
  "outOfOffice",
  "focusTime",
  "workingLocation",
  "fromGmail",
  "birthday",
] as const;

type GoogleEventType = (typeof googleEventTypes)[number];

type EventTypeVerdict =
  | { readonly kind: "mirrored"; readonly availability: Availability }
  | { readonly kind: "withheld" }
  | { readonly kind: "unrecognised" };

const readEventType = (value: string | null | undefined): GoogleEventType | null =>
  unimplemented(value);

const verdictForEventType = (eventType: GoogleEventType): EventTypeVerdict => unimplemented(eventType);

export { googleEventTypes, readEventType, verdictForEventType };
export type { EventTypeVerdict, GoogleEventType };
