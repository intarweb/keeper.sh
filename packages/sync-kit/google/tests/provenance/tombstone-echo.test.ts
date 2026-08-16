import { describe, expect, test } from "vitest";
import { decodeProvenance, provenancePropertyKey } from "../../src/decode/provenance";
import { deterministicEventId } from "../../src/write/event-id";
import { googleCalendar } from "../support/harness";
import { createHarness } from "../support/harness";
import { cancelledException } from "../support/items";

const ourDeterministicId = (harness: ReturnType<typeof createHarness>): string => {
  const derived = deterministicEventId(
    { kind: "idempotencyKey", value: "mirror-of-source-1" },
    googleCalendar.calendar,
    harness.environment.hash,
  );
  if (derived.kind !== "eventId") {
    throw new Error("the deterministic id fell outside Google's length rule");
  }
  return derived.value;
};

describe("our own writes are recognised even as bare tombstones", () => {
  test("GOOG-O16: a cancelled exception carrying only an id is still recognised as ours", () => {
    const harness = createHarness();
    const ours = ourDeterministicId(harness);
    const tombstone = cancelledException(ours, "master", "2026-03-21T09:00:00.000Z");

    const provenance = decodeProvenance(tombstone, {
      installation: harness.environment.installation,
      deterministicIds: new Set([ours]),
    });

    expect(provenance).toEqual({
      kind: "ours",
      installation: harness.environment.installation,
    });
  });

  test("GOOG-O16: the extended property channel recognises a full event", () => {
    const harness = createHarness();

    const provenance = decodeProvenance(
      {
        id: "some-id",
        status: "confirmed",
        extendedProperties: {
          private: { [provenancePropertyKey]: harness.environment.installation.value },
        },
      },
      { installation: harness.environment.installation, deterministicIds: new Set() },
    );

    expect(provenance.kind).toBe("ours");
  });

  test("GOOG-O16: an event neither channel claims is foreign, never indeterminate by default", () => {
    const harness = createHarness();

    const provenance = decodeProvenance(
      { id: "somebody-elses", status: "confirmed" },
      { installation: harness.environment.installation, deterministicIds: new Set() },
    );

    expect(provenance).toEqual({ kind: "foreign" });
  });
});
