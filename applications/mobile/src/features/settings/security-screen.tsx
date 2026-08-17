import { useEffect, useState } from "react";
import { BodyText as Text } from "@/components/typography";

import { Field, PrimaryButton, ToggleRow } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { useAppLock } from "@/providers/app-lock-provider";
import { useApp } from "@/providers/app-provider";
import { hasCredentialPassword } from "@/features/settings/password-state";

export function SecurityScreen() {
  const { auth, capabilities } = useApp();
  const lock = useAppLock();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    auth
      .listAccounts()
      .then((result) => {
        if (!live) return;
        if (result.error)
          setMessage(result.error.message ?? "Could not load password status.");
        setHasPassword(hasCredentialPassword(result.data));
      })
      .catch((reason: unknown) => {
        if (live) {
          setHasPassword(false);
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Could not load password status.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [auth]);
  const change = async () => {
    const result = await auth.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
    setMessage(result.error?.message ?? "Password changed.");
  };
  return (
    <Screen>
      <Section title="App Lock">
        <ToggleRow
          label="Unlock with biometrics"
          detail={
            lock.supported
              ? "Uses enrolled Face ID, Touch ID, or fingerprint. Device passcode fallback is disabled."
              : "No enrolled biometric unlock method is available on this device."
          }
          value={lock.enabled}
          disabled={!lock.supported}
          onValueChange={lock.setEnabled}
        />
      </Section>
      {capabilities?.supportsChangePassword && hasPassword ? (
        <>
          <Section title="Password">
            <Field
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrent}
              secureTextEntry
            />
            <Field
              label="New Password"
              value={newPassword}
              onChangeText={setNew}
              secureTextEntry
            />
          </Section>
          <PrimaryButton
            disabled={!currentPassword || newPassword.length < 8}
            label="Change Password"
            onPress={change}
          />
        </>
      ) : capabilities?.supportsChangePassword && hasPassword === false ? (
        <Text selectable style={{ color: colors.secondaryLabel }}>
          This account uses passwordless or social sign-in and has no password
          to change.
        </Text>
      ) : null}
      {message ? (
        <Text
          selectable
          style={{
            color:
              message === "Password changed." ? colors.success : colors.danger,
          }}
        >
          {message}
        </Text>
      ) : null}
      <Section title="Passkeys">
        <Row
          icon="person.badge.key"
          label="Passkeys"
          detail={
            capabilities?.supportsPasskeys
              ? "Manage sign-in passkeys"
              : "Not enabled on this server"
          }
          disabled={!capabilities?.supportsPasskeys}
          href="/(tabs)/settings/passkeys"
        />
      </Section>
    </Screen>
  );
}
