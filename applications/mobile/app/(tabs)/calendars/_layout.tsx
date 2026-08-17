import Stack from "expo-router/stack";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
export default function CalendarsLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: "Calendars", headerLargeTitle: false }}
      />
      <Stack.Screen name="connect" options={{ title: "Connect Calendar" }} />
      <Stack.Screen
        name="connect-provider"
        options={{ title: "Connect Provider" }}
      />
    </Stack>
  );
}
