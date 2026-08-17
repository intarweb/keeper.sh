import { useEffect, type PropsWithChildren, type ReactNode } from "react";
import { useObserve } from "expo-observe";
import {
  ScrollView,
  View,
  useWindowDimensions,
  type ScrollViewProps,
} from "react-native";

import { colors } from "@/design/colors";
import { keeperSpacing } from "@/design/tokens";

export function Screen({
  children,
  contentContainerStyle,
  ...props
}: PropsWithChildren<ScrollViewProps>) {
  const { markInteractive } = useObserve();
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 768 ? keeperSpacing.xl : keeperSpacing.lg;
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        {
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          padding: horizontalPadding,
          gap: keeperSpacing.lg,
          paddingBottom: 48,
        },
        contentContainerStyle,
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export function ScreenFill({ children }: { children: ReactNode }) {
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {children}
    </View>
  );
}
