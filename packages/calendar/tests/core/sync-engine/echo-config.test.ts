import { describe, expect, it } from "vitest";
import { resolveEchoConfig } from "../../../src/core/sync-engine/echo-config";

describe("resolveEchoConfig", () => {
  it("defaults to the echo comparison with adoption running", () => {
    expect(resolveEchoConfig({})).toEqual({
      adoptionEnabled: true,
      maxAdoptionsPerRun: 2000,
      mode: "on",
    });
  });

  it("reads every switch independently", () => {
    expect(resolveEchoConfig({
      KEEPER_ECHO_ADOPTION: "off",
      KEEPER_ECHO_ADOPTION_MAX_PER_RUN: "10",
      KEEPER_ECHO_COMPARISON: "off",
    })).toEqual({
      adoptionEnabled: false,
      maxAdoptionsPerRun: 10,
      mode: "off",
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
    expect(() => resolveEchoConfig({ KEEPER_ECHO_ADOPTION_MAX_PER_RUN: "0" }))
      .toThrow("KEEPER_ECHO_ADOPTION_MAX_PER_RUN");
    expect(() => resolveEchoConfig({ KEEPER_ECHO_ADOPTION_MAX_PER_RUN: "not-a-number" }))
      .toThrow("KEEPER_ECHO_ADOPTION_MAX_PER_RUN");
  });
});
