import Stack from "expo-router/stack";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
export default function SettingsLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: "Settings", headerLargeTitle: false }}
      />
      <Stack.Screen name="profile" options={{ title: "Profile & Account" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
      <Stack.Screen name="passkeys" options={{ title: "Passkeys" }} />
      <Stack.Screen name="api-tokens" options={{ title: "API Tokens" }} />
      <Stack.Screen name="ical" options={{ title: "iCal Feed" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy & Analytics" }} />
      <Stack.Screen name="plan" options={{ title: "Plan & Billing" }} />
      <Stack.Screen name="feedback" options={{ title: "Feedback" }} />
      <Stack.Screen name="report" options={{ title: "Report a Problem" }} />
      <Stack.Screen name="about" options={{ title: "About" }} />
      <Stack.Screen name="server" options={{ title: "Server" }} />
    </Stack>
  );
}
