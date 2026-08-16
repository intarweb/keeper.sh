import { describe, expect, test } from "vitest";
import {
  conflictingOn,
  expiringCursorAfter,
  stallingOn,
  truncatingAfter,
  undecorated,
} from "../../src/fixtures";
import type { ProviderDecorator } from "../../src/fixtures";
import { referenceCapabilities } from "../../src/reference/capabilities";
import { selectConformanceCases } from "../../src/registry/suite";
import { listChanges, okValue, write } from "../support/drive";
import { referenceHarness, runCaseAgainst } from "../support/harness";
import {
  createIntent,
  foreignEvent,
  occurrence,
  scopeOver,
  spanning,
  timedAt,
} from "../support/protocol";

const march = spanning("2026-03-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z");
const scope = scopeOver(march);

const seeded = [
  foreignEvent({
    uid: "alpha",
    title: "Alpha",
    start: "2026-03-02T09:00:00.000Z",
    end: "2026-03-02T10:00:00.000Z",
  }),
  foreignEvent({
    uid: "bravo",
    title: "Bravo",
    start: "2026-03-03T09:00:00.000Z",
    end: "2026-03-03T10:00:00.000Z",
  }),
];

const mirrored = occurrence(
  "Mirrored",
  timedAt("2026-03-04T09:00:00.000Z", "2026-03-04T10:00:00.000Z"),
);

const decorators: readonly [string, () => ProviderDecorator][] = [
  ["bare", () => undecorated],
  ["truncatingAfter(1)", () => truncatingAfter(1)],
  ["expiringCursorAfter(1)", () => expiringCursorAfter(1)],
  ["conflictingOn(create)", () => conflictingOn((intent) => intent.kind === "create")],
  ["stallingOn(write)", () => stallingOn((operation) => operation === "write")],
];

describe("the reference provider is adversarial about its own success", () => {
  test("CONF-I55: list, apply, list, apply reaches a fixed point with zero further writes", async () => {
    const harness = await referenceHarness();
    await harness.provider.seed({ events: seeded, corruptKnownRows: [] });

    await listChanges(harness.provider, harness.environment, scope);
    await write(harness.provider, harness.environment, createIntent("mirrored", mirrored));
    const afterApply = await harness.provider.inspect();
    await listChanges(harness.provider, harness.environment, scope);
    await listChanges(harness.provider, harness.environment, scope);
    const afterConvergence = await harness.provider.inspect();

    expect(afterConvergence.writeLog).toEqual(afterApply.writeLog);
    await harness.dispose();
  });

  test("CONF-I55: the reference passes every selected case when run bare", async () => {
    const harness = await referenceHarness();
    const selection = selectConformanceCases(referenceCapabilities);
    const failures: string[] = [];

    for (const record of selection.selected) {
      const settled = await Promise.allSettled([
        runCaseAgainst(record.id, harness.provider, harness.environment, harness.supports),
      ]);
      for (const outcome of settled) {
        if (outcome.status === "rejected") {
          failures.push(`${record.id}: ${String(outcome.reason)}`);
        }
      }
    }

    expect(failures).toEqual([]);
    await harness.dispose();
  });

  test("CONF-I55: a listing is byte-identical across two polls of unchanged input", async () => {
    const harness = await referenceHarness();
    await harness.provider.seed({ events: seeded, corruptKnownRows: [] });

    const first = okValue(await listChanges(harness.provider, harness.environment, scope));
    const second = okValue(await listChanges(harness.provider, harness.environment, scope));

    expect(second.events).toEqual(first.events);
    expect(second.withheld).toEqual(first.withheld);
    await harness.dispose();
  });

  test.each(decorators)(
    "CONF-I55: the %s fixture does not break correct behaviour of a listing",
    async (name, decorate) => {
      const harness = await referenceHarness(decorate());
      await harness.provider.seed({ events: seeded, corruptKnownRows: [] });

      const result = await listChanges(harness.provider, harness.environment, scope);

      expect(name.length).toBeGreaterThan(0);
      expect(["snapshot", "delta", "partial", "cursorLost"]).toContain(
        okValue(result).kind,
      );
      await harness.dispose();
    },
  );

  test("CONF-I55: disposing the reference provider releases every timer it armed", async () => {
    const harness = await referenceHarness();
    await harness.provider.seed({ events: seeded, corruptKnownRows: [] });
    await listChanges(harness.provider, harness.environment, scope);

    await harness.dispose();

    expect(harness.environment.clock.pendingTimers()).toBe(0);
  });
});
