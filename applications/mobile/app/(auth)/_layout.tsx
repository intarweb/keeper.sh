import Stack from "expo-router/stack";
import { keeperStackScreenOptions } from "@/design/navigation-theme";
import { HeaderBackButton } from "@/components/navigation-controls";

export default function AuthLayout() {
  return (
    <Stack screenOptions={keeperStackScreenOptions}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: "Register" }} />
      <Stack.Screen
        name="forgot-password"
        options={{ title: "Reset Password" }}
      />
      <Stack.Screen
        name="reset-password"
        options={{ title: "Choose Password" }}
      />
      <Stack.Screen name="verify-email" options={{ title: "Verify Email" }} />
      <Stack.Screen
        name="callback"
        options={{
          title: "Signing In",
          headerLeft: () => (
            <HeaderBackButton label="Close" fallback="/(auth)/login" />
          ),
        }}
      />
      <Stack.Screen name="server-profile" options={{ title: "Server" }} />
    </Stack>
  );
}
