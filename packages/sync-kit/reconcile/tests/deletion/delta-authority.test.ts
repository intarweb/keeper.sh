import { describe, expect, test } from "vitest";
import { firstOf } from "../support/at";
import { planReconciliation, presenceBasis, removalBasis } from "../../src/index";
import {
  deltaListing,
  knownEvent,
  knownState,
  mapping,
  mappingSet,
  policy,
  remoteId,
  slotIdentity,
  uid,
} from "../support/fixtures";
import { sourceOnly } from "../support/fixtures";
import { sameIdentity } from "../support/keys";

const identities = [1, 2, 3, 4, 5].map((index) =>
  slotIdentity(`evt-${index}`, "2026-03-10T09:00:00.000Z", "2026-03-10T10:00:00.000Z"),
);

const known = () => knownState(identities.map((identity) => knownEvent({ identity })));

const mapped = () =>
  mappingSet(identities.map((identity, index) => mapping({ identity, destinationId: `mirror-${index}` })));

const deltaNamingOneRemoval = () =>
  deltaListing({
    events: [],
    removals: [{ kind: "deleted", id: remoteId("evt-1"), uid: uid("evt-1") }],
  });

describe("a delta page deletes only what it names", () => {
  test("RECON-O3: four omitted known events survive a delta that names one removal", () => {
    const plan = planReconciliation(
      sourceOnly(deltaNamingOneRemoval()),
      known(),
      mapped(),
      policy(),
    );

    expect(plan.tombstones).toHaveLength(1);
    expect(sameIdentity(firstOf(plan.tombstones).identity, firstOf(identities))).toBe(true);
    expect(firstOf(plan.tombstones).cause).toBe("explicitRemoval");
  });

  test("RECON-O3: the removal basis of a delta carries no absence axis at all", () => {
    const listing = deltaNamingOneRemoval();

    const basis = removalBasis(listing, known(), presenceBasis(listing), policy());

    expect(basis.absent).toEqual([]);
    expect(basis.explicit).toHaveLength(1);
  });

  test("RECON-O3: an empty delta removes nothing even though it lists nothing", () => {
    const plan = planReconciliation(
      sourceOnly(deltaListing({ events: [], removals: [] })),
      known(),
      mapped(),
      policy(),
    );

    expect(plan.tombstones).toEqual([]);
  });

  test("RECON-O3: an outOfScope removal is not an authoritative deletion", () => {
    const plan = planReconciliation(
      sourceOnly(
        deltaListing({ removals: [{ kind: "outOfScope", id: remoteId("evt-2") }] }),
      ),
      known(),
      mapped(),
      policy(),
    );

    expect(plan.tombstones.map((tombstone) => tombstone.cause)).not.toContain("explicitRemoval");
  });

  test("RECON-O3: a delta naming every known event does remove every one of them", () => {
    const plan = planReconciliation(
      sourceOnly(
        deltaListing({
          removals: identities.map((identity) => ({
            kind: "deleted" as const,
            id: remoteId(identity.uid.value),
            uid: identity.uid,
          })),
        }),
      ),
      known(),
      mapped(),
      policy(),
    );

    expect(plan.tombstones).toHaveLength(5);
  });
});
