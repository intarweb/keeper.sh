import CommunityDateTimePicker from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { BodyText as Text } from "@/components/typography";

import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii } from "@/design/tokens";
import { combineLocalDateAndTime } from "@/features/events/event-date-logic";

type PickerMode = "date" | "time";

function PickerButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: keeperRadii.control,
        borderCurve: "continuous",
        backgroundColor: colors.background,
        borderColor: colors.separator,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text
        style={{
          color: colors.label,
          fontFamily: keeperFonts.bodyMedium,
          fontSize: 15,
        }}
      >
        {value}
      </Text>
    </Pressable>
  );
}

function applyPickerValue(current: Date, next: Date, mode: PickerMode): Date {
  return mode === "date"
    ? combineLocalDateAndTime(next, current)
    : combineLocalDateAndTime(current, next);
}

export function NativeDateTimeField({
  label,
  value,
  onValueChange,
  allDay = false,
  minimumDate,
  mode = "date-time",
}: {
  label: string;
  value: Date;
  onValueChange(value: Date): void;
  allDay?: boolean;
  minimumDate?: Date;
  mode?: "date-time" | "date" | "time";
}) {
  const [androidMode, setAndroidMode] = useState<PickerMode | null>(null);
  const dateLabel = value.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = value.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (Platform.OS === "web") {
    return (
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: colors.secondaryLabel,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
        <View
          style={{
            minHeight: 48,
            borderRadius: keeperRadii.control,
            borderColor: colors.separator,
            borderWidth: 1,
            backgroundColor: colors.background,
            paddingHorizontal: 14,
            justifyContent: "center",
          }}
        >
          <Text selectable style={{ color: colors.label, fontSize: 16 }}>
            {mode === "time" ? timeLabel : dateLabel}
            {mode === "date-time" && !allDay ? ` · ${timeLabel}` : ""}
          </Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: colors.secondaryLabel,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
        <View
          style={{
            minHeight: 56,
            borderRadius: keeperRadii.control,
            borderColor: colors.separator,
            borderWidth: 1,
            backgroundColor: colors.background,
            padding: 8,
            flexDirection: "column",
            gap: 8,
            alignItems: "stretch",
          }}
        >
          {mode !== "time" ? (
            <PickerButton
              label={`Choose ${label.toLowerCase()} date`}
              value={dateLabel}
              onPress={() => setAndroidMode("date")}
            />
          ) : null}
          {mode !== "date" && !allDay ? (
            <PickerButton
              label={`Choose ${label.toLowerCase()} time`}
              value={timeLabel}
              onPress={() => setAndroidMode("time")}
            />
          ) : null}
        </View>
        {androidMode ? (
          <CommunityDateTimePicker
            value={value}
            mode={androidMode}
            display="default"
            presentation="dialog"
            minimumDate={androidMode === "date" ? minimumDate : undefined}
            onValueChange={(_event, next) => {
              onValueChange(applyPickerValue(value, next, androidMode));
              setAndroidMode(null);
            }}
            onDismiss={() => setAndroidMode(null)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: colors.secondaryLabel,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <View
        style={{
          minHeight: 56,
          borderRadius: keeperRadii.control,
          borderColor: colors.separator,
          borderWidth: 1,
          backgroundColor: colors.background,
          paddingHorizontal: 10,
          flexDirection: "row",
          gap: 4,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {mode !== "time" ? (
          <CommunityDateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            accentColor={colors.accent as string}
            onValueChange={(_event, next) =>
              onValueChange(applyPickerValue(value, next, "date"))
            }
          />
        ) : null}
        {mode !== "date" && !allDay ? (
          <CommunityDateTimePicker
            value={value}
            mode="time"
            display="compact"
            accentColor={colors.accent as string}
            onValueChange={(_event, next) =>
              onValueChange(applyPickerValue(value, next, "time"))
            }
          />
        ) : null}
      </View>
    </View>
  );
}
