import { useEffect } from "react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import { router } from "expo-router";
import { Platform } from "react-native";

import type { MobileApi } from "@/api/mobile-api";
import { storePendingIntent } from "@/navigation/pending-intent";
import { resolveNotificationPath } from "@/notifications/notification-routing";
import { useApp } from "@/providers/app-provider";
import {
  getInstallationId,
  pushEnabledPreferenceKey,
  pushErrorPreferenceKey,
  revokeCurrentPush,
} from "@/notifications/device-state";
import { preferences, usePreference } from "@/storage/preferences";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("keeper-updates", {
    importance: Notifications.AndroidImportance.DEFAULT,
    name: "Keeper updates",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function persistPushRegistration(api: MobileApi): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error("Set EXPO_PUBLIC_EAS_PROJECT_ID before registering push.");
  await ensureAndroidChannel();
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const installationId = await getInstallationId(true);
  if (!installationId)
    throw new Error("Could not create a device installation ID.");
  await api.client.registerMobileDevice({
    appVersion: Application.nativeApplicationVersion ?? undefined,
    deviceName: Device.deviceName ?? undefined,
    installationId,
    platform: Platform.OS === "android" ? "android" : "ios",
    pushToken: token,
  });
  return token;
}

function handleNotificationData(
  data: Record<string, unknown>,
  authenticated: boolean,
) {
  const path = resolveNotificationPath(data);
  if (!path) return;
  if (authenticated) router.push(path as never);
  else {
    storePendingIntent(path);
    router.replace(
      `/(auth)/login?redirect=${encodeURIComponent(path)}` as never,
    );
  }
}

export function NotificationBridge() {
  const { api, loading, profile, session } = useApp();
  const userId = session?.user.id ?? "anonymous";
  const enabledKey = pushEnabledPreferenceKey(profile.id, userId);
  const errorKey = pushErrorPreferenceKey(profile.id, userId);
  const [pushEnabled] = usePreference(enabledKey, false);
  useEffect(() => {
    if (loading) return;
    let live = true;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!live || !response) return;
      handleNotificationData(
        response.notification.request.content.data ?? {},
        Boolean(session),
      );
      Notifications.clearLastNotificationResponse();
    });
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationData(
          response.notification.request.content.data ?? {},
          Boolean(session),
        );
      });
    let tokenSubscription: { remove(): void } | undefined;
    if (session && pushEnabled) {
      Notifications.getPermissionsAsync().then((permission) => {
        if (!live) return;
        if (!permission.granted) {
          preferences.set(
            errorKey,
            "Push was enabled, but notification permission is no longer granted.",
          );
          return;
        }
        void persistPushRegistration(api)
          .then(() => preferences.remove(errorKey))
          .catch((reason: unknown) =>
            preferences.set(
              errorKey,
              reason instanceof Error
                ? reason.message
                : "Push registration failed.",
            ),
          );
        tokenSubscription = Notifications.addPushTokenListener(() => {
          void persistPushRegistration(api)
            .then(() => preferences.remove(errorKey))
            .catch((reason: unknown) =>
              preferences.set(
                errorKey,
                reason instanceof Error
                  ? reason.message
                  : "Push token rotation failed.",
              ),
            );
        });
      });
    }
    return () => {
      live = false;
      responseSubscription.remove();
      tokenSubscription?.remove();
    };
  }, [api, errorKey, loading, pushEnabled, session]);
  return null;
}

export async function registerForPush(api: MobileApi): Promise<string> {
  if (!Device.isDevice)
    throw new Error("Push notifications require a physical device.");
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error("Notification permission was not granted.");
  return persistPushRegistration(api);
}

export { revokeCurrentPush } from "@/notifications/device-state";
