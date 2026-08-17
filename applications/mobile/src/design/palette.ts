export interface KeeperPalette {
  accent: string;
  background: string;
  backgroundHover: string;
  backgroundInverse: string;
  borderElevated: string;
  card: string;
  danger: string;
  dangerBackground: string;
  dangerBorder: string;
  foregroundInverse: string;
  groupedBackground: string;
  highlight: string;
  label: string;
  ring: string;
  secondaryLabel: string;
  separator: string;
  success: string;
  template: string;
  warning: string;
}

export const keeperPalettes = {
  light: {
    accent: "#0a0a0a",
    background: "#fafafa",
    backgroundHover: "#f0f0f0",
    backgroundInverse: "#0a0a0a",
    borderElevated: "#d4d4d4",
    card: "#ffffff",
    danger: "#b91c1c",
    dangerBackground: "#fef2f2",
    dangerBorder: "#fecaca",
    foregroundInverse: "#fafafa",
    groupedBackground: "#fafafa",
    highlight: "#2563eb",
    label: "#0a0a0a",
    ring: "#3b82f6",
    secondaryLabel: "#737373",
    separator: "#d4d4d4",
    success: "#059669",
    template: "#9333ea",
    warning: "#b45309",
  },
  dark: {
    accent: "#f5f5f5",
    background: "#0a0a0a",
    backgroundHover: "#242424",
    backgroundInverse: "#f5f5f5",
    borderElevated: "#262626",
    card: "#171717",
    danger: "#fca5a5",
    dangerBackground: "#2a1517",
    dangerBorder: "#5f2027",
    foregroundInverse: "#0a0a0a",
    groupedBackground: "#0a0a0a",
    highlight: "#60a5fa",
    label: "#f5f5f5",
    ring: "#60a5fa",
    secondaryLabel: "#a3a3a3",
    separator: "#262626",
    success: "#34d399",
    template: "#c084fc",
    warning: "#fbbf24",
  },
} as const satisfies Record<"light" | "dark", KeeperPalette>;

export function resolveKeeperPalette(
  scheme: string | null | undefined,
): KeeperPalette {
  return keeperPalettes[scheme === "dark" ? "dark" : "light"];
}
