import Stack from "expo-router/stack";
import { HeaderBackButton } from "@/components/navigation-controls";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
export default function CalendarLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="[calendarId]"
        options={{
          title: "Calendar Settings",
          headerLeft: () => <HeaderBackButton fallback="/(tabs)/calendars" />,
        }}
      />
    </Stack>
  );
}
