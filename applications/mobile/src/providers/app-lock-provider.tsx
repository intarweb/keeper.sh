import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Pressable, View } from "react-native";

import { BodyText as Text } from "@/components/typography";

import { colors } from "@/design/colors";
import { preferences, usePreference } from "@/storage/preferences";

const AppLockContext = createContext({
  supported: false,
  enabled: false,
  setEnabled: async (_value: boolean) => false,
  unlock: async () => false,
});

export function AppLockProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = usePreference("biometric-lock", false);
  const [supported, setSupported] = useState(false);
  const [locked, setLocked] = useState(() =>
    preferences.get("biometric-lock", false),
  );
  useEffect(() => {
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hardware, enrolled]) => setSupported(hardware && enrolled));
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (enabled && state !== "active") setLocked(true);
    });
    return () => subscription.remove();
  }, [enabled]);
  const unlock = useCallback(async () => {
    if (!enabled) {
      setLocked(false);
      return true;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock Keeper.sh",
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
      fallbackLabel: "",
    });
    if (result.success) setLocked(false);
    return result.success;
  }, [enabled]);
  const updateEnabled = useCallback(
    async (value: boolean) => {
      if (!value) {
        setEnabled(false);
        setLocked(false);
        return true;
      }
      const available =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      if (!available) return false;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable Keeper.sh biometric lock",
        cancelLabel: "Cancel",
        disableDeviceFallback: true,
        fallbackLabel: "",
      });
      if (!result.success) return false;
      setEnabled(true);
      setLocked(false);
      return true;
    },
    [setEnabled],
  );
  useEffect(() => {
    if (enabled && locked) void unlock();
  }, [enabled, locked, unlock]);
  return (
    <AppLockContext
      value={{ supported, enabled, setEnabled: updateEnabled, unlock }}
    >
      {children}
      {locked ? (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
            padding: 30,
            gap: 14,
          }}
        >
          <Text
            style={{ color: colors.label, fontSize: 25, fontWeight: "700" }}
          >
            Keeper.sh is locked
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={unlock}
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Unlock</Text>
          </Pressable>
        </View>
      ) : null}
    </AppLockContext>
  );
}

export function useAppLock() {
  return use(AppLockContext);
}
