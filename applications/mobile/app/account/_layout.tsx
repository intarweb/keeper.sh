import Stack from "expo-router/stack";
import { HeaderBackButton } from "@/components/navigation-controls";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
export default function AccountLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="[accountId]/index"
        options={{
          title: "Account",
          headerLeft: () => <HeaderBackButton fallback="/(tabs)/calendars" />,
        }}
      />
      <Stack.Screen
        name="[accountId]/setup"
        options={{
          title: "Setup & Mappings",
          headerLeft: () => <HeaderBackButton fallback="/(tabs)/calendars" />,
        }}
      />
    </Stack>
  );
}
