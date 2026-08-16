import { describe, expectTypeOf, test } from "vitest";
import type {
  CalendarKey,
  CalendarProvider,
  DeleteHandle,
  EditableContent,
  IdempotencyKey,
  NormalizedContent,
  Precondition,
  Provenance,
  RemoteEventId,
  RemoteVersion,
  WriteIntent,
} from "../src/index";

declare const calendar: CalendarKey;
declare const target: RemoteEventId;
declare const handle: DeleteHandle;
declare const normalized: NormalizedContent<"google">;
declare const rawContent: EditableContent;
declare const idempotencyKey: IdempotencyKey;
declare const ourProvenance: Extract<Provenance, { kind: "ours" }>;
declare const precondition: Precondition;
declare const version: RemoteVersion;
declare const googleIntent: WriteIntent<"google">;

declare const acceptIntent: (intent: WriteIntent<"google">) => void;
declare const acceptOutlookIntent: (
  intent: Parameters<CalendarProvider<"outlook">["write"]>[0],
) => void;

describe("a write cannot be expressed without the guard it needs", () => {
  test("an update WriteIntent without a precondition does not compile", () => {
    // @ts-expect-error last-write-wins clobbers a change made in the provider UI
    acceptIntent({ kind: "update", calendar, target, content: normalized });
    expectTypeOf<
      Extract<WriteIntent<"google">, { kind: "update" }>["precondition"]
    >().toEqualTypeOf<Precondition>();
  });

  test("a delete WriteIntent without a precondition does not compile", () => {
    // @ts-expect-error a deleted remote event cannot be restored
    acceptIntent({ kind: "delete", calendar, target: handle, reason: "sourceDeleted" });
  });

  test("a retire WriteIntent without a precondition does not compile", () => {
    // @ts-expect-error retiring an object that changed after we read it is unrecoverable
    acceptIntent({ kind: "retire", calendar, target: handle, reason: "outsideWindow" });
  });

  test("a create's precondition can only be absent", () => {
    acceptIntent({
      kind: "create",
      calendar,
      idempotencyKey,
      content: normalized,
      provenance: ourProvenance,
      // @ts-expect-error a create must surface a collision, never overwrite it
      precondition: { kind: "matchesVersion", version },
    });
    expectTypeOf<
      Extract<WriteIntent<"google">, { kind: "create" }>["precondition"]
    >().toEqualTypeOf<{ readonly kind: "absent" }>();
  });

  test("a create without an idempotencyKey does not compile", () => {
    // @ts-expect-error a retried push without a key creates a visible duplicate
    acceptIntent({
      kind: "create",
      calendar,
      content: normalized,
      provenance: ourProvenance,
      precondition: { kind: "absent" },
    });
  });

  test("unnormalized EditableContent cannot reach a write", () => {
    acceptIntent({
      kind: "update",
      calendar,
      target,
      precondition,
      // @ts-expect-error only provider.normalize may mint the content a write carries
      content: rawContent,
    });
  });

  test("content normalized for one provider cannot be written to another", () => {
    // @ts-expect-error google-shaped normalization diverges on every echo from outlook
    acceptOutlookIntent(googleIntent);
  });
});
