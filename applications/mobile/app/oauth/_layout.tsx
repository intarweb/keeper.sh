import Stack from "expo-router/stack";
import { HeaderBackButton } from "@/components/navigation-controls";
import { keeperStackScreenOptions } from "@/design/navigation-theme";

export default function OAuthLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="callback"
        options={{
          title: "Connecting",
          headerLeft: () => (
            <HeaderBackButton label="Close" fallback="/(tabs)/calendars" />
          ),
        }}
      />
    </Stack>
  );
}
