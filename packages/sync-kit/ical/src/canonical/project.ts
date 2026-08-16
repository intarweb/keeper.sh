import type { EditableContent, Instant, WithholdReason } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { EventIdentity } from "../parse/identity";
import type { ParsedVevent } from "../parse/parse-vevent";
import type { CanonicalEvent } from "./canonical-event";

type CanonicalProjection =
  | { readonly kind: "projected"; readonly event: CanonicalEvent }
  | { readonly kind: "withheld"; readonly identity: EventIdentity; readonly reason: WithholdReason };

const exceptionInstant = (value: string): Instant | null => {
  if (!/^\d{8}T\d{6}Z$/u.test(value)) {
    return null;
  }
  return {
    kind: "instant",
    value: new Date(
      Date.UTC(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)) - 1,
        Number(value.slice(6, 8)),
        Number(value.slice(9, 11)),
        Number(value.slice(11, 13)),
        Number(value.slice(13, 15)),
      ),
    ).toISOString(),
  };
};

const cancellationsOf = (content: EditableContent): readonly Instant[] => {
  if (!content.recurrence) {
    return [];
  }
  return content.recurrence.exceptions.flatMap((value) => {
    const instant = exceptionInstant(value);
    if (!instant) {
      return [];
    }
    return [instant];
  });
};

const canonicalOf = (event: ParsedVevent): CanonicalEvent => ({
  identity: event.identity,
  content: event.content,
  cancellations: cancellationsOf(event.content),
});

const projectCanonicalEvent = (event: ParsedVevent, _options: IcsOptions): CanonicalProjection => ({
  kind: "projected",
  event: canonicalOf(event),
});

export { canonicalOf, projectCanonicalEvent };
export type { CanonicalProjection };
