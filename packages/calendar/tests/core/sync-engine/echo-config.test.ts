import { describe, expect, it } from "vitest";
import { resolveEchoConfig } from "../../../src/core/sync-engine/echo-config";

describe("resolveEchoConfig", () => {
  it("defaults to the legacy comparison with adoption running and repair off", () => {
    expect(resolveEchoConfig({})).toEqual({
      adoptionEnabled: true,
      maxAdoptionsPerRun: 2000,
      maxAgeMs: 86_400_000,
      mode: "off",
      repairOnAdopt: false,
    });
  });

  it("reads every switch independently", () => {
    expect(resolveEchoConfig({
      KEEPER_ECHO_ADOPTION: "off",
      KEEPER_ECHO_ADOPTION_MAX_PER_RUN: "10",
      KEEPER_ECHO_COMPARISON: "on",
      KEEPER_ECHO_MAX_AGE_MS: "3600000",
      KEEPER_ECHO_REPAIR_ON_ADOPT: "on",
    })).toEqual({
      adoptionEnabled: false,
      maxAdoptionsPerRun: 10,
      maxAgeMs: 3_600_000,
      mode: "on",
      repairOnAdopt: true,
    });
  });

  it("accepts shadow as a declared state distinct from off", () => {
    expect(resolveEchoConfig({ KEEPER_ECHO_COMPARISON: "shadow" }).mode).toBe("shadow");
  });

  it("rejects an unrecognized comparison mode rather than silently disabling itself", () => {
    expect(() => resolveEchoConfig({ KEEPER_ECHO_COMPARISON: "ON" }))
      .toThrow("KEEPER_ECHO_COMPARISON");
  });

  it("rejects an unrecognized switch value", () => {
    expect(() => resolveEchoConfig({ KEEPER_ECHO_ADOPTION: "yes" }))
      .toThrow("KEEPER_ECHO_ADOPTION");
  });

  it("rejects a non-positive numeric override", () => {
    expect(() => resolveEchoConfig({ KEEPER_ECHO_MAX_AGE_MS: "0" }))
      .toThrow("KEEPER_ECHO_MAX_AGE_MS");
    expect(() => resolveEchoConfig({ KEEPER_ECHO_ADOPTION_MAX_PER_RUN: "not-a-number" }))
      .toThrow("KEEPER_ECHO_ADOPTION_MAX_PER_RUN");
  });
});
