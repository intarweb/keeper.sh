import { useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import {
  BodyText as Text,
  EditorialHeading,
  MutedText,
} from "@/components/typography";

import { BrandMark } from "@/components/brand";
import { Field, PrimaryButton } from "@/components/form-controls";
import { ProviderIcon } from "@/components/provider-icon";
import { Screen } from "@/components/screen";
import {
  canUseNativePasskeys,
  passkeyErrorMessage,
} from "@/auth/passkey-logic";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import { isSafeInternalPath } from "@/navigation/deep-links";
import {
  consumePendingIntent,
  storePendingIntent,
} from "@/navigation/pending-intent";

type AuthMode = "login" | "register";

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const {
    auth,
    capabilities,
    error: connectionError,
    profile,
    refreshSession,
  } = useApp();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credentialMode = capabilities?.credentialMode ?? "email";
  const nativePasskeysSupported = canUseNativePasskeys(
    capabilities?.supportsPasskeys,
    profile.hosted,
  );

  const finishSignIn = async () => {
    const nextSession = await refreshSession();
    if (!nextSession)
      throw new Error("Authentication completed without creating a session.");
    const destination =
      redirect && isSafeInternalPath(redirect)
        ? redirect
        : (consumePendingIntent() ?? "/(tabs)/today");
    router.replace(destination as never);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (credentialMode === "username") {
        const endpoint =
          mode === "login"
            ? "/username-only/sign-in"
            : "/username-only/sign-up";
        const result = await auth.$fetch(endpoint, {
          method: "POST",
          body: { username: credential, password },
        });
        if (result.error)
          throw new Error(result.error.message ?? "Authentication failed.");
      } else if (mode === "login") {
        const result = await auth.signIn.email({ email: credential, password });
        if (result.error)
          throw new Error(result.error.message ?? "Sign in failed.");
      } else {
        const result = await auth.signUp.email({
          callbackURL: "keeper://verify-email",
          email: credential,
          name: credential.split("@")[0] ?? credential,
          password,
        });
        if (result.error)
          throw new Error(result.error.message ?? "Registration failed.");
      }
      if (mode === "register" && capabilities?.requiresEmailVerification) {
        if (redirect && isSafeInternalPath(redirect))
          storePendingIntent(redirect);
        router.replace("/(auth)/verify-email");
        return;
      }
      await finishSignIn();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signInWithPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await auth.signIn.passkey();
      if (result.error)
        throw new Error(
          passkeyErrorMessage(
            result.error,
            "Passkey sign-in failed.",
            "Passkey sign-in was cancelled.",
          ),
        );
      await finishSignIn();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Passkey sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: "google" | "microsoft") => {
    setError(null);
    if (redirect && isSafeInternalPath(redirect)) storePendingIntent(redirect);
    const result = await auth.signIn.social({
      provider,
      callbackURL: "keeper://callback",
    });
    if (result.error)
      setError(result.error.message ?? "Social sign in failed.");
  };

  return (
    <Screen
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        maxWidth: 360,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 8, paddingBottom: 8, alignItems: "center" }}>
        <BrandMark size={40} />
        <EditorialHeading level={1} style={{ textAlign: "center" }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </EditorialHeading>
        <MutedText style={{ textAlign: "center" }}>
          {mode === "login" ? "Sign in" : "Get started"} with {profile.name}
        </MutedText>
      </View>
      <Field
        label={credentialMode === "username" ? "Username" : "Email"}
        value={credential}
        onChangeText={setCredential}
        keyboardType={credentialMode === "email" ? "email-address" : "default"}
        placeholder={credentialMode === "email" ? "you@example.com" : "johndoe"}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {connectionError ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.danger }}
        >
          {connectionError} Check the server profile below.
        </Text>
      ) : null}
      {error ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.danger }}
        >
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        busy={busy}
        disabled={!capabilities || !credential || password.length < 8}
        label={mode === "login" ? "Sign In" : "Create Account"}
        onPress={submit}
      />
      {mode === "login" && nativePasskeysSupported ? (
        <>
          <Text style={{ color: colors.secondaryLabel, textAlign: "center" }}>
            or
          </Text>
          <PrimaryButton
            variant="border"
            busy={busy}
            label="Sign in with a passkey"
            onPress={signInWithPasskey}
          />
        </>
      ) : null}
      {mode === "login" && capabilities?.supportsPasswordReset ? (
        <Link
          href="/(auth)/forgot-password"
          style={{
            color: colors.secondaryLabel,
            textAlign: "center",
            padding: 8,
            textDecorationLine: "underline",
          }}
        >
          Forgot password?
        </Link>
      ) : null}
      {capabilities?.socialProviders.google ? (
        <PrimaryButton
          variant="border"
          leading={<ProviderIcon provider="google" size={20} />}
          label={`${mode === "login" ? "Continue" : "Register"} with Google`}
          onPress={() => social("google")}
        />
      ) : null}
      {capabilities?.socialProviders.microsoft ? (
        <PrimaryButton
          variant="border"
          leading={<ProviderIcon provider="microsoft" size={20} />}
          label={`${mode === "login" ? "Continue" : "Register"} with Microsoft`}
          onPress={() => social("microsoft")}
        />
      ) : null}
      <Link
        href={mode === "login" ? "/(auth)/register" : "/(auth)/login"}
        style={{
          color: colors.label,
          textAlign: "center",
          padding: 8,
          textDecorationLine: "underline",
        }}
      >
        {mode === "login"
          ? "New to Keeper.sh? Create an account"
          : "Already have an account? Sign in"}
      </Link>
      <Link
        href="/(auth)/server-profile"
        style={{
          color: colors.secondaryLabel,
          textAlign: "center",
          padding: 8,
          textDecorationLine: "underline",
        }}
      >
        Server: {profile.baseUrl}
      </Link>
    </Screen>
  );
}
