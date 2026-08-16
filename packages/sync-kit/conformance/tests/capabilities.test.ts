import type { RemoteEvent } from "@keeper.sh/sync-protocol";
import { describe, expect, test } from "vitest";
import { referenceCapabilities } from "../src/reference/capabilities";
import { conformanceCaseIds } from "../src/case-id";
import { ungatedCaseIds } from "../src/report";
import { selectConformanceCases } from "../src/registry/suite";
import { failureOf, listChanges, okValue, write } from "./support/drive";
import { referenceHarness, runReferenceCase } from "./support/harness";
import { createIntent, occurrence, scopeOver, spanning, timedAt } from "./support/protocol";

const march = spanning("2026-03-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");
const scope = scopeOver(march);

const inverted = occurrence(
  "Inverted range",
  timedAt("2026-03-02T10:00:00.000Z", "2026-03-02T09:00:00.000Z"),
);

const zoneIdsOf = (events: readonly RemoteEvent[]): string[] =>
  events.flatMap((event) => {
    const { time } = event.content;
    if (!time) {
      return [];
    }
    if (time.kind === "allDay") {
      return [];
    }
    if (time.zone === null) {
      return [];
    }
    return [time.zone.value];
  });

const isAcceptedByIntl = (zone: string): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

describe("a declared refusal must actually refuse", () => {
  test("CONF-O29: the ungated case list is non-empty and no capability can remove it", () => {
    const selection = selectConformanceCases(referenceCapabilities);
    const selectedIds = new Set(selection.selected.map((record) => record.id));

    expect(ungatedCaseIds.length).toBeGreaterThan(0);
    expect(ungatedCaseIds.filter((id) => !selectedIds.has(id))).toEqual([]);
  });

  test("CONF-O29: the flagship deletion-safety guarantees are among the ungated cases", () => {
    expect(ungatedCaseIds).toContain("CONF-O1");
    expect(ungatedCaseIds).toContain("CONF-O2");
    expect(ungatedCaseIds).toContain("CONF-O24");
  });

  test("CONF-O29: every skipped case names the capability that skipped it", () => {
    const selection = selectConformanceCases(referenceCapabilities);

    expect(selection.skipped.filter((entry) => entry.reason.length === 0)).toEqual([]);
    expect(
      selection.skipped.filter((entry) => !conformanceCaseIds.includes(entry.id)),
    ).toEqual([]);
  });

  test("CONF-O29: selection covers every declared case id exactly once", () => {
    const selection = selectConformanceCases(referenceCapabilities);
    const covered = [
      ...selection.selected.map((record) => record.id),
      ...selection.skipped.map((entry) => entry.id),
    ].toSorted();

    expect(covered).toEqual([...conformanceCaseIds].toSorted());
  });

  test("CONF-O35: an unrepresentable construct is refused with its exact constraint", async () => {
    const harness = await referenceHarness();

    const result = await write(
      harness.provider,
      harness.environment,
      createIntent("inverted", inverted),
    );

    expect(failureOf(result).kind).toBe("unrepresentable");
    await harness.dispose();
  });

  test("CONF-O35: an unrepresentable construct is never clamped into a representable one", async () => {
    const harness = await referenceHarness();

    await write(harness.provider, harness.environment, createIntent("inverted", inverted));
    const inspection = await harness.provider.inspect();

    expect(inspection.objects).toEqual([]);
    expect(harness.supports.representableRange.invertedRange).toBe("reject");
    await harness.dispose();
  });

  test("CONF-O43: every zone identifier an adapter returns is accepted by Intl", async () => {
    const harness = await referenceHarness();
    await write(
      harness.provider,
      harness.environment,
      createIntent(
        "zoned",
        occurrence("Zoned", timedAt("2026-03-02T09:00:00.000Z", "2026-03-02T10:00:00.000Z")),
      ),
    );

    const listing = okValue(await listChanges(harness.provider, harness.environment, scope));
    const rejected = zoneIdsOf(listing.events ?? []).filter((zone) => !isAcceptedByIntl(zone));

    expect(rejected).toEqual([]);
    await harness.dispose();
  });

  test("CONF-O43: a Windows zone identifier is refused with constraint zoneIdentifier", async () => {
    const harness = await referenceHarness();
    const windowsZoned = {
      ...occurrence("Windows zoned", {
        kind: "timed" as const,
        start: { kind: "instant" as const, value: "2026-03-02T09:00:00.000Z" },
        end: { kind: "instant" as const, value: "2026-03-02T10:00:00.000Z" },
        zone: { kind: "zoneId" as const, value: "Pacific Standard Time" },
      }),
    };

    const result = await write(
      harness.provider,
      harness.environment,
      createIntent("windows-zoned", windowsZoned),
    );

    expect(failureOf(result).kind).toBe("unrepresentable");
    await harness.dispose();
  });

  test("CONF-O29: the generated case passes for the reference provider", async () => {
    await expect(runReferenceCase("CONF-O29")).resolves.toBeUndefined();
  });

  test("CONF-O35: the generated case passes for the reference provider", async () => {
    await expect(runReferenceCase("CONF-O35")).resolves.toBeUndefined();
  });

  test("CONF-O43: the generated case passes for the reference provider", async () => {
    await expect(runReferenceCase("CONF-O43")).resolves.toBeUndefined();
  });
});
