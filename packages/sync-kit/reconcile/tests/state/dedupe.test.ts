import { describe, expect, test } from "vitest";
import { firstOf } from "../support/at";
import { dedupeObservations } from "../../src/index";
import { foreignEvent, slotIdentity } from "../support/fixtures";

const identity = slotIdentity("evt-1", "2026-03-10T09:00:00.000Z", "2026-03-10T10:00:00.000Z");

const observationAtRevision = (revision: number) => ({
  identity,
  event: foreignEvent({
    id: "evt-1",
    uid: "evt-1",
    revision,
    version: `v${revision}`,
    fingerprint: `fp-rev-${revision}`,
  }),
});

describe("at most one observation survives per identity", () => {
  test("RECON-I36: three reports of one occurrence collapse to one", () => {
    const deduped = dedupeObservations([1, 2, 3].map((revision) => observationAtRevision(revision)));

    expect(deduped.kept).toHaveLength(1);
  });

  test("RECON-I36: the survivor is the highest revision, not the last in the array", () => {
    const deduped = dedupeObservations([3, 1, 2].map((revision) => observationAtRevision(revision)));

    expect(firstOf(deduped.kept).event.revision).toBe(3);
  });

  test("RECON-I36: the superseded keys are reported rather than silently dropped", () => {
    const deduped = dedupeObservations([1, 2, 3].map((revision) => observationAtRevision(revision)));

    expect(deduped.supersededKeys).toHaveLength(2);
  });

  test("RECON-I36: two distinct identities both survive", () => {
    const other = {
      identity: slotIdentity("evt-2", "2026-03-11T09:00:00.000Z", "2026-03-11T10:00:00.000Z"),
      event: foreignEvent({ id: "evt-2", uid: "evt-2" }),
    };

    expect(dedupeObservations([observationAtRevision(1), other]).kept).toHaveLength(2);
  });

  test("RECON-I36: deduping an empty batch is an empty batch, not a throw", () => {
    expect(dedupeObservations([])).toEqual({ kept: [], supersededKeys: [], comparisons: 0 });
  });
});
