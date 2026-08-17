import { describe, expect, it } from "vitest";

import { keeperPalettes, resolveKeeperPalette } from "../src/design/palette";
import { keeperFonts, keeperRadii } from "../src/design/tokens";

describe("Keeper mobile design system", () => {
  it("matches the canonical web light palette", () => {
    expect(resolveKeeperPalette("light")).toMatchObject({
      background: "#fafafa",
      card: "#ffffff",
      label: "#0a0a0a",
      secondaryLabel: "#737373",
      separator: "#d4d4d4",
      ring: "#3b82f6",
    });
  });

  it("matches the canonical web dark palette", () => {
    expect(resolveKeeperPalette("dark")).toMatchObject({
      background: "#0a0a0a",
      card: "#171717",
      label: "#f5f5f5",
      secondaryLabel: "#a3a3a3",
      separator: "#262626",
      ring: "#60a5fa",
    });
  });

  it("reserves emerald for success instead of global actions", () => {
    expect(keeperPalettes.light.accent).toBe(keeperPalettes.light.label);
    expect(keeperPalettes.dark.accent).toBe(keeperPalettes.dark.label);
    expect(keeperPalettes.light.success).not.toBe(keeperPalettes.light.accent);
  });

  it("keeps Keeper's nested surface geometry and type roles", () => {
    expect(keeperRadii).toEqual({
      control: 12,
      row: 14,
      surface: 16,
      pill: 999,
    });
    expect(keeperFonts).toMatchObject({
      body: "Geist_400Regular",
      editorial: "Lora_500Medium",
      mono: "GeistMono_400Regular",
    });
  });
});
