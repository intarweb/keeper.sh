import { useState } from "react";
import { router } from "expo-router";
import { BodyText as Text } from "@/components/typography";

import { Field, PrimaryButton } from "@/components/form-controls";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import {
  createServerProfile,
  hostedProfile,
  normalizeServerUrl,
} from "@/storage/server-profile";

export function ServerProfileScreen() {
  const { profile, session, setProfile } = useApp();
  const [url, setUrl] = useState(profile.baseUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = normalizeServerUrl(url);
      if (baseUrl === profile.baseUrl) {
        if (session) router.back();
        else router.replace("/(auth)/login");
        return;
      }
      await setProfile(createServerProfile(baseUrl));
      router.replace("/(auth)/login");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not use this server.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Text selectable style={{ color: colors.secondaryLabel, lineHeight: 20 }}>
        Use hosted Keeper.sh or connect to a trusted self-hosted instance. Data,
        sessions, and device preferences remain isolated per full server URL.
        {session
          ? " Switching servers signs out this account and clears its local data."
          : ""}
      </Text>
      <Field
        label="Keeper Server URL"
        value={url}
        onChangeText={setUrl}
        placeholder="https://keeper.example.com"
        keyboardType="url"
      />
      <PrimaryButton
        busy={busy}
        label="Validate and Use Server"
        onPress={save}
      />
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label="Use Keeper.sh Hosted"
        onPress={async () => {
          if (profile.baseUrl === hostedProfile.baseUrl && session) {
            router.back();
            return;
          }
          await setProfile(hostedProfile);
          router.replace("/(auth)/login");
        }}
      />
    </Screen>
  );
}
