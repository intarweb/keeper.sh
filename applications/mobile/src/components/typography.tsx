import type { ComponentProps } from "react";
import { Text, type TextStyle } from "react-native";

import { colors } from "@/design/colors";
import { keeperFonts } from "@/design/tokens";

type TextProps = ComponentProps<typeof Text>;

function KeeperText({ style, ...props }: TextProps) {
  return (
    <Text
      selectable
      {...props}
      style={[
        {
          color: colors.label,
          fontFamily: keeperFonts.body,
          fontSize: 15,
          flexShrink: 1,
          letterSpacing: -0.15,
        },
        style,
      ]}
    />
  );
}

export function BodyText(props: TextProps) {
  return <KeeperText {...props} />;
}

export function MutedText({ style, ...props }: TextProps) {
  return (
    <KeeperText
      {...props}
      style={[
        { color: colors.secondaryLabel, fontSize: 14, lineHeight: 20 },
        style,
      ]}
    />
  );
}

export function DashboardHeading({
  level = 1,
  style,
  ...props
}: TextProps & { level?: 1 | 2 | 3 }) {
  const sizes: Record<1 | 2 | 3, TextStyle> = {
    1: { fontSize: 24, lineHeight: 29 },
    2: { fontSize: 18, lineHeight: 23 },
    3: { fontSize: 16, lineHeight: 21 },
  };
  return (
    <KeeperText
      accessibilityRole="header"
      {...props}
      style={[
        { fontFamily: keeperFonts.bodyMedium, letterSpacing: -0.5 },
        sizes[level],
        style,
      ]}
    />
  );
}

export function EditorialHeading({
  level = 1,
  style,
  ...props
}: TextProps & { level?: 1 | 2 | 3 }) {
  const sizes: Record<1 | 2 | 3, TextStyle> = {
    1: { fontSize: 36, lineHeight: 39 },
    2: { fontSize: 24, lineHeight: 29 },
    3: { fontSize: 20, lineHeight: 25 },
  };
  return (
    <KeeperText
      accessibilityRole="header"
      {...props}
      style={[
        { fontFamily: keeperFonts.editorial, letterSpacing: -1.1 },
        sizes[level],
        style,
      ]}
    />
  );
}

export function MonoText({ style, ...props }: TextProps) {
  return (
    <KeeperText
      {...props}
      style={[
        { fontFamily: keeperFonts.mono, fontVariant: ["tabular-nums"] },
        style,
      ]}
    />
  );
}
