import { useEffect } from "react";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { Lora_500Medium } from "@expo-google-fonts/lora/500Medium";
import { useFonts } from "expo-font";
import { ThemeProvider } from "expo-router/react-navigation";
import Stack from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { ObserveRoot, useObserve } from "expo-observe";
import { useColorScheme } from "react-native";

import { LoadingState } from "@/components/states";
import { AppLockProvider } from "@/providers/app-lock-provider";
import { AppProvider, useApp } from "@/providers/app-provider";
import { NotificationBridge } from "@/notifications/notifications";
import {
  configureObservability,
  DIAGNOSTICS_CONSENT_KEY,
} from "@/observability/consent";
import { usePreference } from "@/storage/preferences";
import { keeperNavigationTheme } from "@/design/navigation-theme";

configureObservability();
void SplashScreen.preventAutoHideAsync();

function Navigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { loading, session } = useApp();
  const { markInteractive } = useObserve();
  useEffect(() => {
    if (!loading && fontsLoaded) {
      void SplashScreen.hideAsync();
      markInteractive();
    }
  }, [fontsLoaded, loading, markInteractive]);
  if (!fontsLoaded) return null;
  if (loading) return <LoadingState label="Opening Keeper.sh…" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{ animation: "none", gestureEnabled: false }}
      />
      <Stack.Protected guard={!session}>
        <Stack.Screen
          name="(auth)"
          options={{ animation: "none", gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen
          name="(tabs)"
          options={{ animation: "none", gestureEnabled: false }}
        />
        <Stack.Screen name="account" options={{ gestureEnabled: true }} />
        <Stack.Screen name="calendar" options={{ gestureEnabled: true }} />
        <Stack.Screen name="event" options={{ gestureEnabled: true }} />
      </Stack.Protected>
      <Stack.Screen name="oauth" />
      <Stack.Screen name="open" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    Lora_500Medium,
  });
  const [diagnostics] = usePreference(DIAGNOSTICS_CONSENT_KEY, false);
  useEffect(() => {
    configureObservability(diagnostics);
  }, [diagnostics]);
  if (fontError) throw fontError;
  return (
    <ThemeProvider value={keeperNavigationTheme(scheme)}>
      <AppProvider>
        <AppLockProvider>
          <NotificationBridge />
          <Navigator fontsLoaded={fontsLoaded} />
        </AppLockProvider>
      </AppProvider>
    </ThemeProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);
