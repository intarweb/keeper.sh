import { Disjoint } from "@ark/schema/internal/shared/disjoint.js";
import type { UnitNode } from "@ark/schema/internal/roots/unit.js";
import { type } from "arktype";
import { describe, expect, it } from "vitest";

describe("ArkType on Static Hermes", () => {
  it("preserves Disjoint identity when Array#map drops its subclass", () => {
    // ArkType's public Type proxy is the underlying UnitNode at runtime, but
    // the public and internal declarations intentionally do not expose that.
    const get = type.unit("GET") as unknown as UnitNode;
    const post = type.unit("POST") as unknown as UnitNode;
    const disjoint = Disjoint.init("unit", get, post);

    // Static Hermes returns Array rather than Disjoint from Array#map.
    // Giving the instance Array as its constructor reproduces that result in V8.
    Object.defineProperty(disjoint, "constructor", { value: Array });

    const prefixed = disjoint.withPrefixKey("method", "required");

    expect(prefixed).toBeInstanceOf(Disjoint);
    expect(prefixed[0]).toMatchObject({
      kind: "unit",
      path: ["method"],
      optional: false,
    });
  });
});
