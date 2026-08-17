import { useEffect, useState } from "react";

import { PrimaryButton } from "@/components/form-controls";
import { NativePreferences } from "@/components/native-preferences";
import { Screen } from "@/components/screen";
import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import {
  pushEnabledPreferenceKey,
  pushErrorPreferenceKey,
} from "@/notifications/device-state";
import {
  registerForPush,
  revokeCurrentPush,
} from "@/notifications/notifications";
import { useApp } from "@/providers/app-provider";
import { usePreference } from "@/storage/preferences";

interface NotificationPreferences {
  invites: boolean;
  reauthentication: boolean;
  syncFailures: boolean;
}

export function NotificationsScreen() {
  const { api, profile, session } = useApp();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    invites: true,
    reauthentication: true,
    syncFailures: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const userId = session?.user.id ?? "anonymous";
  const [pushEnabled, setPushEnabled] = usePreference(
    pushEnabledPreferenceKey(profile.id, userId),
    false,
  );
  const [pushError, setPushError] = usePreference<string | null>(
    pushErrorPreferenceKey(profile.id, userId),
    null,
  );

  useEffect(() => {
    api.client
      .getNotificationPreferences()
      .then(setPreferences)
      .catch((reason: unknown) => {
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Could not load notification preferences.",
        );
      });
  }, [api.client]);

  const change = async (key: string, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try {
      setPreferences(
        await api.client.updateNotificationPreferences({ [key]: value }),
      );
    } catch (reason) {
      setPreferences(preferences);
      setMessage(
        reason instanceof Error ? reason.message : "Could not save preference.",
      );
    }
  };

  const enable = async () => {
    try {
      await registerForPush(api);
      setPushEnabled(true);
      setPushError(null);
      setMessage("This device is registered for push notifications.");
    } catch (reason) {
      const next =
        reason instanceof Error ? reason.message : "Push registration failed.";
      setPushError(next);
      setMessage(next);
    }
  };

  const disable = async () => {
    try {
      const revoked = await revokeCurrentPush(api);
      setPushEnabled(false);
      setPushError(null);
      setMessage(
        revoked
          ? "Push notifications are disabled for this device."
          : "Push is disabled; this device had no server registration.",
      );
    } catch (reason) {
      const next =
        reason instanceof Error ? reason.message : "Could not disable push.";
      setPushError(next);
      setMessage(next);
    }
  };

  return (
    <Screen>
      <NativePreferences
        title="Push notifications"
        footer={`Push is ${pushEnabled ? "enabled" : "disabled"} on this device. Lock-screen payloads are privacy-redacted by default.`}
        items={[
          {
            key: "reauthentication",
            label: "Account needs reauthentication",
            value: preferences.reauthentication,
          },
          {
            key: "syncFailures",
            label: "Durable sync failures",
            value: preferences.syncFailures,
          },
          {
            key: "invites",
            label: "Calendar invitations",
            value: preferences.invites,
          },
        ]}
        onChange={change}
      />
      <PrimaryButton
        variant="elevated"
        label="Enable push on this device"
        disabled={pushEnabled}
        onPress={enable}
      />
      <PrimaryButton
        destructive
        label="Disable push on this device"
        disabled={!pushEnabled}
        onPress={disable}
      />
      {pushError ? (
        <BodyText style={{ color: colors.danger }}>{pushError}</BodyText>
      ) : message ? (
        <MutedText>{message}</MutedText>
      ) : null}
    </Screen>
  );
}
