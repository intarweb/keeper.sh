import { useId, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { committedActionHaptic } from "@/design/haptics";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";

export interface FieldProps {
  autoCapitalize?: "none" | "sentences" | "words";
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  multiline?: boolean;
  onChangeText(value: string): void;
  placeholder?: string;
  secureTextEntry?: boolean;
  value: string;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  editable = true,
  autoCapitalize = "none",
}: FieldProps) {
  const labelId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: 6, opacity: editable ? 1 : 0.5 }}>
      <MutedText
        nativeID={labelId}
        style={{ fontFamily: keeperFonts.bodyMedium, fontSize: 14 }}
      >
        {label}
      </MutedText>
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        accessibilityState={{ disabled: !editable }}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryLabel}
        secureTextEntry={secureTextEntry}
        value={value}
        style={{
          minHeight: multiline ? 112 : 44,
          backgroundColor: colors.background,
          color: colors.label,
          borderRadius: keeperRadii.control,
          borderCurve: "continuous",
          borderColor: focused ? colors.ring : colors.separator,
          borderWidth: focused ? 2 : 1,
          paddingHorizontal: 16,
          paddingVertical: 10,
          fontFamily: keeperFonts.body,
          fontSize: 16,
          letterSpacing: -0.2,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

export type ButtonVariant =
  | "primary"
  | "inverse"
  | "border"
  | "elevated"
  | "ghost"
  | "destructive";

export interface PrimaryButtonProps {
  busy?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  label: string;
  leading?: ReactNode;
  onPress(): void | Promise<void>;
  variant?: ButtonVariant;
}

export function PrimaryButton({
  label,
  leading,
  onPress,
  disabled,
  destructive,
  busy,
  variant = destructive ? "destructive" : "primary",
}: PrimaryButtonProps) {
  const unavailable = disabled || busy;
  const primary = variant === "primary";
  const inverse = variant === "inverse";
  const destructiveButton = variant === "destructive";
  const backgroundColor = inverse
    ? "#fafafa"
    : primary
      ? colors.backgroundInverse
      : destructiveButton
        ? colors.dangerBackground
        : variant === "elevated"
          ? colors.card
          : "transparent";
  const foregroundColor = inverse
    ? "#0a0a0a"
    : primary
      ? colors.foregroundInverse
      : destructiveButton
        ? colors.danger
        : colors.label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      onPress={async () => {
        await committedActionHaptic();
        await onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: keeperRadii.control,
        borderCurve: "continuous",
        borderWidth: variant === "ghost" ? 0 : 1,
        borderColor: destructiveButton
          ? colors.dangerBorder
          : primary || inverse
            ? colors.backgroundInverse
            : colors.separator,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor:
          pressed && !primary && !inverse && !destructiveButton
            ? colors.backgroundHover
            : backgroundColor,
        boxShadow: variant === "ghost" ? undefined : keeperShadow,
        opacity: unavailable
          ? 0.42
          : pressed && (primary || inverse || destructiveButton)
            ? 0.8
            : 1,
      })}
    >
      {busy ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator color={foregroundColor} />
          <BodyText
            style={{
              color: foregroundColor,
              fontFamily: keeperFonts.bodyMedium,
              fontSize: 16,
            }}
          >
            Working…
          </BodyText>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          {leading}
          <BodyText
            style={{
              color: foregroundColor,
              fontFamily: keeperFonts.bodyMedium,
              fontSize: 16,
            }}
          >
            {label}
          </BodyText>
        </View>
      )}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange(value: boolean): void;
  disabled?: boolean;
}) {
  return (
    <View
      accessible={false}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 11,
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: keeperRadii.row,
        borderCurve: "continuous",
      }}
    >
      <View importantForAccessibility="no" style={{ flex: 1, gap: 2 }}>
        <BodyText style={{ fontSize: 15 }}>{label}</BodyText>
        {detail ? (
          <MutedText style={{ fontSize: 12, lineHeight: 17 }}>
            {detail}
          </MutedText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={detail}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        hitSlop={8}
        ios_backgroundColor={colors.separator}
        onValueChange={onValueChange}
        thumbColor={value ? colors.foregroundInverse : colors.card}
        trackColor={{ false: colors.separator, true: colors.backgroundInverse }}
        value={value}
      />
    </View>
  );
}

export function useSubmission(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}
