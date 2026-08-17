import { Image } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View, type ColorValue } from "react-native";

import { ProviderIcon, type KeeperProvider } from "@/components/provider-icon";
import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";

export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <BodyText
          accessibilityRole="header"
          style={{
            fontFamily: keeperFonts.bodyMedium,
            fontSize: 17,
            paddingHorizontal: 4,
          }}
        >
          {title}
        </BodyText>
      ) : null}
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: keeperRadii.surface,
          borderCurve: "continuous",
          borderColor: colors.borderElevated,
          borderWidth: 1,
          padding: 2,
          overflow: "hidden",
          boxShadow: keeperShadow,
        }}
      >
        {children}
      </View>
      {footer ? (
        <MutedText
          style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}
        >
          {footer}
        </MutedText>
      ) : null}
    </View>
  );
}

interface RowProps {
  destructive?: boolean;
  detail?: string;
  disabled?: boolean;
  href?: string;
  icon?: string;
  label: string;
  monospace?: boolean;
  onPress?: () => void;
  provider?: KeeperProvider;
  selected?: boolean;
  selectionRole?: "checkbox" | "radio";
  trailing?: ReactNode;
}

export function Row({
  destructive,
  detail,
  disabled,
  href,
  icon,
  label,
  monospace,
  onPress,
  provider,
  selected,
  selectionRole,
  trailing,
}: RowProps) {
  const role =
    selectionRole ??
    (selected === undefined
      ? href
        ? "link"
        : onPress
          ? "button"
          : undefined
      : "checkbox");
  const content = (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: selected, disabled, selected }}
      disabled={disabled}
      onPress={onPress ?? (href ? () => router.push(href as never) : undefined)}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 11,
        opacity: disabled ? 0.42 : 1,
        backgroundColor: pressed ? colors.backgroundHover : "transparent",
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        borderRadius: keeperRadii.row,
        borderCurve: "continuous",
      })}
    >
      {provider ? (
        <ProviderIcon provider={provider} />
      ) : icon ? (
        <Image
          accessible={false}
          source={`sf:${icon}`}
          style={{ width: 17, height: 17 }}
          tintColor={
            (destructive ? colors.danger : colors.secondaryLabel) as string
          }
        />
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <BodyText
          style={{
            color: destructive ? colors.danger : colors.label,
            fontFamily: monospace ? keeperFonts.mono : keeperFonts.body,
            fontSize: monospace ? 13 : 15,
          }}
        >
          {label}
        </BodyText>
        {detail ? (
          <MutedText numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
            {detail}
          </MutedText>
        ) : null}
      </View>
      {trailing ??
        (href ? (
          <Image
            accessible={false}
            source="sf:chevron.right"
            style={{ width: 10, height: 14 }}
            tintColor={colors.secondaryLabel as string}
          />
        ) : null)}
    </Pressable>
  );

  return content;
}

export function StatusPill({
  label,
  color = colors.secondaryLabel,
}: {
  label: string;
  color?: ColorValue;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: keeperRadii.pill,
        backgroundColor: colors.backgroundHover,
      }}
    >
      <BodyText
        style={{ color, fontFamily: keeperFonts.bodyMedium, fontSize: 12 }}
      >
        {label}
      </BodyText>
    </View>
  );
}
