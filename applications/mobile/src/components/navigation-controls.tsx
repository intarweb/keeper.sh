import { router } from "expo-router";
import { Pressable } from "react-native";

import { BodyText } from "@/components/typography";
import { keeperFonts } from "@/design/tokens";

export function HeaderBackButton({
  fallback,
  label = "‹ Back",
}: {
  fallback: string;
  label?: string;
}) {
  const navigateBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback as never);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.replace("‹ ", "")}
      hitSlop={8}
      onPress={navigateBack}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        justifyContent: "center",
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <BodyText style={{ fontFamily: keeperFonts.bodyMedium }}>
        {label}
      </BodyText>
    </Pressable>
  );
}
