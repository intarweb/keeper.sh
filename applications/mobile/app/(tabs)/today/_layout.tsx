import Stack from "expo-router/stack";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
export default function TodayLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: "Today",
          headerLargeTitle: false,
          headerRight: () => null,
        }}
      />
      <Stack.Screen name="activity" options={{ title: "Activity" }} />
      <Stack.Screen name="invitations" options={{ title: "Invitations" }} />
      <Stack.Screen name="sync-control" options={{ title: "Sync Control" }} />
    </Stack>
  );
}
