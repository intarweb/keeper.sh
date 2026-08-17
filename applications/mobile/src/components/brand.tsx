import { Image } from "expo-image";
import type { PropsWithChildren } from "react";
import { useColorScheme, View } from "react-native";

import { BodyText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";

export function BrandMark({ size = 30 }: { size?: number }) {
  const scheme = useColorScheme();
  return (
    <Image
      accessibilityLabel="Keeper.sh"
      source={
        scheme === "dark"
          ? require("../../assets/splash-icon-dark.png")
          : require("../../assets/splash-icon.png")
      }
      contentFit="contain"
      style={{ width: size, height: size }}
    />
  );
}

export function KeeperFooter() {
  return (
    <View style={{ alignItems: "center", paddingVertical: 16, gap: 8 }}>
      <BrandMark size={22} />
      <BodyText style={{ color: colors.secondaryLabel, fontSize: 11 }}>
        Keeper.sh · calendars in sync
      </BodyText>
    </View>
  );
}

export function UpgradeCard({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        gap: 14,
        padding: 18,
        borderRadius: keeperRadii.surface,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: "#404040",
        backgroundColor: "#171717",
        boxShadow: keeperShadow,
      }}
    >
      {children}
    </View>
  );
}

export function TemplateText({ children }: PropsWithChildren) {
  return (
    <BodyText
      style={{
        color: colors.template,
        fontFamily: keeperFonts.mono,
        fontSize: 13,
      }}
    >
      {children}
    </BodyText>
  );
}
