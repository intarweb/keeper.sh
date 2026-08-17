import {
  DarkTheme,
  DefaultTheme,
  type Theme,
} from "expo-router/react-navigation";
import type { ColorSchemeName } from "react-native";

import { keeperPalettes } from "@/design/colors";
import { keeperFonts } from "@/design/tokens";

export function keeperNavigationTheme(
  scheme: ColorSchemeName | null | undefined,
): Theme {
  const dark = scheme === "dark";
  const palette = keeperPalettes[dark ? "dark" : "light"];
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: palette.label,
      background: palette.background,
      card: palette.background,
      text: palette.label,
      border: palette.borderElevated,
      notification: palette.success,
    },
    fonts: {
      regular: { fontFamily: keeperFonts.body, fontWeight: "400" },
      medium: { fontFamily: keeperFonts.bodyMedium, fontWeight: "500" },
      bold: { fontFamily: keeperFonts.bodySemibold, fontWeight: "600" },
      heavy: { fontFamily: keeperFonts.bodySemibold, fontWeight: "600" },
    },
  };
}

export const keeperStackScreenOptions = {
  headerBackButtonDisplayMode: "minimal" as const,
  headerLargeTitle: false,
  headerShadowVisible: false,
  headerTitleStyle: {
    fontFamily: keeperFonts.bodyMedium,
    fontWeight: "500" as const,
  },
  headerLargeTitleStyle: {
    fontFamily: keeperFonts.editorial,
    fontWeight: "500" as const,
  },
};
