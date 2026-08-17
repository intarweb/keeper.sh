import { NativeTabs } from "expo-router/unstable-native-tabs";

import { colors } from "@/design/colors";
import { keeperFonts } from "@/design/tokens";

export default function TabsLayout() {
  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      backgroundColor={colors.card}
      iconColor={{ default: colors.secondaryLabel, selected: colors.label }}
      tintColor={colors.label}
      labelStyle={{ fontFamily: keeperFonts.bodyMedium, fontSize: 12 }}
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon
          sf={{ default: "sun.max", selected: "sun.max.fill" }}
          md="today"
        />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendars">
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar.circle.fill" }}
          md="calendar_month"
        />
        <NativeTabs.Trigger.Label>Calendars</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          md="settings"
        />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
