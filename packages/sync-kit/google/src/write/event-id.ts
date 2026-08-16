import type { CalendarId, IdempotencyKey } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const googleEventIdLimits = { minimumLength: 5, maximumLength: 1024 } as const;

type GoogleEventId =
  | { readonly kind: "eventId"; readonly value: string }
  | { readonly kind: "outOfRange"; readonly length: number };

const deterministicEventId = (
  idempotencyKey: IdempotencyKey,
  calendar: CalendarId,
  hash: (input: string) => string,
): GoogleEventId => unimplemented(idempotencyKey, calendar, hash);

export { deterministicEventId, googleEventIdLimits };
export type { GoogleEventId };
