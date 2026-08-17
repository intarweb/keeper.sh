import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { BodyText as Text } from "@/components/typography";

import { Field, PrimaryButton } from "@/components/form-controls";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export function ForgotPasswordScreen() {
  const { auth } = useApp();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <PrimaryButton
        label="Send Reset Link"
        disabled={!email}
        onPress={async () => {
          const result = await auth.requestPasswordReset({
            email,
            redirectTo: "keeper://reset-password",
          });
          if (result.error)
            setError(result.error.message ?? "Could not send reset link.");
          else setMessage("Check your email for a reset link.");
        }}
      />
      {message ? (
        <Text selectable style={{ color: colors.success }}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

export function ResetPasswordScreen() {
  const { token = "" } = useLocalSearchParams<{ token?: string }>();
  const { auth } = useApp();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <Field
        label="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <PrimaryButton
        label="Reset Password"
        disabled={!token || password.length < 8}
        onPress={async () => {
          const result = await auth.resetPassword({
            token,
            newPassword: password,
          });
          if (result.error)
            setError(result.error.message ?? "Could not reset password.");
          else router.replace("/(auth)/login");
        }}
      />
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
