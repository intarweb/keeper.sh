import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConcurrencyGate, createSerialFlushWorker } from "@keeper.sh/calendar";

/*
 * Answers "what breaks first, and at what fleet size" without waiting for production to
 * tell us. Costs are the medians measured on 2026-08-19 from the ingest wide events:
 * four pooled reads totalling 18ms, one 1.4ms write, ~300ms in the provider.
 */

const POOLED_QUERY_GATE = 20;
const READS_PER_SOURCE = 4;
const READ_MS = 4.5;
const WRITE_MS = 1.4;
const PROVIDER_MS = 300;

/* Not separately instrumented; the flush transaction takes an advisory lock then writes. */
const FLUSH_MS = 15;

const PASS_INTERVAL_MS = 60_000;
const FLEET_SIZES = [500, 2000, 5000, 10_000];

interface SimulationResult {
  sources: number;
  makespanMs: number;
  medianLatencyMs: number;
  p90LatencyMs: number;
  gateWaitMedianMs: number;
  flushWaitMedianMs: number;
}

const flagPassOverrun = (makespanMs: number): string => {
  if (makespanMs > PASS_INTERVAL_MS) {
    return "OVER PASS INTERVAL";
  }
  return "";
};

const report = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const percentile = (values: number[], fraction: number): number => {
  const ordered = values.toSorted((first, second) => first - second);
  return ordered[Math.min(Math.floor(ordered.length * fraction), ordered.length - 1)] ?? 0;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const simulate = async (sources: number): Promise<SimulationResult> => {
  const gate = createConcurrencyGate(POOLED_QUERY_GATE);
  const flushWriter = createSerialFlushWorker(
    async (task: () => Promise<null>) => await task(),
    { capacity: sources + 1 },
  );

  const startedAt = Date.now();
  const latencies: number[] = [];
  const gateWaits: number[] = [];
  const flushWaits: number[] = [];

  const runSource = async (): Promise<void> => {
    const sourceStartedAt = Date.now();

    const gateEnteredAt = Date.now();
    for (let read = 0; read < READS_PER_SOURCE; read++) {
      await gate.run(() => sleep(READ_MS));
    }
    gateWaits.push(Date.now() - gateEnteredAt - READS_PER_SOURCE * READ_MS);

    await sleep(PROVIDER_MS);

    const flushRequestedAt = Date.now();
    await flushWriter.submit(async () => {
      flushWaits.push(Date.now() - flushRequestedAt);
      await sleep(FLUSH_MS);
      return null;
    });

    await gate.run(() => sleep(WRITE_MS));
    latencies.push(Date.now() - sourceStartedAt);
  };

  const pending = Promise.all(Array.from({ length: sources }, () => runSource()));
  await vi.runAllTimersAsync();
  await pending;
  await flushWriter.close();

  return {
    sources,
    makespanMs: Date.now() - startedAt,
    medianLatencyMs: percentile(latencies, 0.5),
    p90LatencyMs: percentile(latencies, 0.9),
    gateWaitMedianMs: percentile(gateWaits, 0.5),
    flushWaitMedianMs: percentile(flushWaits, 0.5),
  };
};

describe("ingest under fleet load", () => {
  beforeEach(() => {
    vi.useFakeTimers({ loopLimit: 5_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports where each fleet size lands against the pass interval", async () => {
    const results: SimulationResult[] = [];
    for (const sources of FLEET_SIZES) {
      results.push(await simulate(sources));
    }

    const table = results.map((result) => [
      `sources=${String(result.sources).padStart(6)}`,
      `makespan=${String(Math.round(result.makespanMs)).padStart(7)}ms`,
      `median=${String(Math.round(result.medianLatencyMs)).padStart(6)}ms`,
      `p90=${String(Math.round(result.p90LatencyMs)).padStart(7)}ms`,
      `gate_wait=${String(Math.round(result.gateWaitMedianMs)).padStart(6)}ms`,
      `flush_wait=${String(Math.round(result.flushWaitMedianMs)).padStart(7)}ms`,
      flagPassOverrun(result.makespanMs),
    ].join("  "));
    report(`\n${table.join("\n")}`);

    /*
     * The serial writer is one connection by design, so it is the ceiling once the fleet is
     * large enough: every source's flush queues behind every other source's flush.
     */
    const largest = results.at(-1);
    const largestFleet = FLEET_SIZES.at(-1);
    expect(largest).toBeDefined();
    expect(largestFleet).toBeDefined();
    expect(largest?.makespanMs ?? 0).toBeGreaterThanOrEqual((largestFleet ?? 0) * FLUSH_MS);

    for (const result of results) {
      expect(result.gateWaitMedianMs).toBeLessThan(result.flushWaitMedianMs);
    }

    const sourcesPerPass = Math.floor(PASS_INTERVAL_MS / FLUSH_MS);
    report(
      `serial writer ceiling: ~${String(sourcesPerPass)} sources per ${String(PASS_INTERVAL_MS)}ms pass `
      + `at ${String(FLUSH_MS)}ms per flush\n`,
    );
  }, 120_000);

  it("shows the pooled-query gate is not the binding constraint at fleet scale", async () => {
    const result = await simulate(2000);

    const gateThroughputCeilingMs = (2000 * READS_PER_SOURCE * READ_MS) / POOLED_QUERY_GATE;
    const serialFlushCeilingMs = 2000 * FLUSH_MS;

    expect(serialFlushCeilingMs).toBeGreaterThan(gateThroughputCeilingMs);
    expect(result.flushWaitMedianMs).toBeGreaterThan(result.gateWaitMedianMs);
  }, 120_000);
});
