import { useState } from "react";
import { Alert } from "react-native";
import { BodyText as Text } from "@/components/typography";
import { router } from "expo-router";

import { Field, PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { revokeCurrentPush } from "@/notifications/notifications";
import { useApp } from "@/providers/app-provider";

export function ProfileScreen() {
  const { api, auth, clearCurrentUserData, profile, session, refreshSession } =
    useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signOut = async () => {
    try {
      await revokeCurrentPush(api);
    } catch {
      /* session cleanup must still proceed */
    }
    await auth.signOut();
    await clearCurrentUserData();
    await refreshSession().catch(() => null);
    router.replace("/(auth)/login");
  };
  const remove = () =>
    Alert.alert(
      "Delete Keeper account?",
      "This permanently deletes your Keeper account and calendar connections. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Forever",
          style: "destructive",
          onPress: async () => {
            const result = await auth.deleteUser({
              password: password || undefined,
            });
            if (result.error)
              setError(result.error.message ?? "Account deletion failed.");
            else {
              await clearCurrentUserData();
              await refreshSession().catch(() => null);
              router.replace("/(auth)/login");
            }
          },
        },
      ],
    );
  return (
    <Screen>
      <Section title="Account">
        <Row label="Name" detail={session?.user.name ?? "—"} />
        <Row
          label="Email / Username"
          detail={session?.user.email ?? session?.user.username ?? "—"}
        />
        <Row label="Server" detail={profile.baseUrl} />
      </Section>
      <PrimaryButton label="Sign Out" onPress={signOut} />
      <Section
        title="Delete Account"
        footer="Enter your current password if your server requires reauthentication."
      >
        <Field
          label="Current Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </Section>
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        destructive
        label="Delete Keeper Account"
        onPress={remove}
      />
    </Screen>
  );
}
