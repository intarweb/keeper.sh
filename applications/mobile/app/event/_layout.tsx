import Stack from "expo-router/stack";
import { HeaderBackButton } from "@/components/navigation-controls";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
const formSheet = {
  presentation: "formSheet" as const,
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.75, 1] as [number, number],
  sheetInitialDetentIndex: 0,
  contentStyle: { backgroundColor: "transparent" },
};

export default function EventLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="new"
        options={{
          title: "New Event",
          ...formSheet,
          headerLeft: () => (
            <HeaderBackButton label="Close" fallback="/(tabs)/today" />
          ),
        }}
      />
      <Stack.Screen
        name="[eventId]"
        options={{
          title: "Event",
          headerLeft: () => <HeaderBackButton fallback="/(tabs)/today" />,
        }}
      />
      <Stack.Screen
        name="[eventId]/edit"
        options={{
          title: "Edit Event",
          ...formSheet,
          headerLeft: () => (
            <HeaderBackButton label="Close" fallback="/(tabs)/today" />
          ),
        }}
      />
    </Stack>
  );
}
