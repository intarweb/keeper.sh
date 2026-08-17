import { useCallback, useEffect, useState } from "react";
import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Alert } from "react-native";
import { BodyText as Text } from "@/components/typography";

import {
  canUseNativePasskeys,
  deleteNativePasskey,
  listNativePasskeys,
  passkeyCreatedLabel,
  passkeyErrorMessage,
  passkeyName,
  type PasskeySummary,
} from "@/auth/passkey-logic";
import { PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { colors } from "@/design/colors";
import { successHaptic } from "@/design/haptics";
import { passkeyManagementUrl } from "@/features/settings/web-management-url";
import { useApp } from "@/providers/app-provider";

type Mutation = { kind: "add" } | { id: string; kind: "delete" } | null;

export function PasskeysScreen() {
  const { auth, capabilities, profile } = useApp();
  const supported = capabilities?.supportsPasskeys === true;
  const nativeSupported = canUseNativePasskeys(
    capabilities?.supportsPasskeys,
    profile.hosted,
  );
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [loading, setLoading] = useState(nativeSupported);
  const [mutation, setMutation] = useState<Mutation>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchPasskeys = useCallback(async () => {
    return listNativePasskeys(auth);
  }, [auth]);

  const load = useCallback(async () => {
    if (!nativeSupported) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPasskeys(await fetchPasskeys());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load your passkeys.",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchPasskeys, nativeSupported]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setMutation({ kind: "add" });
    setError(null);
    setMessage(null);
    try {
      const result = await auth.passkey.addPasskey({
        authenticatorAttachment: "platform",
        name: Device.modelName ?? "Mobile device",
      });
      if (result.error)
        throw new Error(
          passkeyErrorMessage(
            result.error,
            "Could not add a passkey.",
            "Passkey creation was cancelled.",
          ),
        );
      if (!result.data) throw new Error("Passkey creation did not complete.");
      setPasskeys(await fetchPasskeys());
      setMessage("Passkey added. You can now use it to sign in.");
      await successHaptic();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not add a passkey.",
      );
    } finally {
      setMutation(null);
    }
  };

  const remove = async (passkey: PasskeySummary) => {
    setMutation({ id: passkey.id, kind: "delete" });
    setError(null);
    setMessage(null);
    try {
      await deleteNativePasskey(auth, passkey.id);
      setPasskeys((current) => current.filter(({ id }) => id !== passkey.id));
      setMessage("Passkey deleted.");
      await successHaptic();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not delete this passkey.",
      );
    } finally {
      setMutation(null);
    }
  };

  const confirmRemove = (passkey: PasskeySummary) =>
    Alert.alert(
      "Delete passkey?",
      `“${passkeyName(passkey)}” will no longer work for signing in to Keeper.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void remove(passkey);
          },
        },
      ],
    );

  if (!supported)
    return (
      <Screen>
        <EmptyState
          title="Passkeys unavailable"
          message="Your configured Keeper server does not advertise passkey support."
        />
      </Screen>
    );

  if (!nativeSupported)
    return (
      <Screen>
        <Text
          selectable
          style={{ color: colors.label, fontSize: 18, fontWeight: "600" }}
        >
          Native passkeys require a custom build
        </Text>
        <Text
          selectable
          style={{ color: colors.secondaryLabel, lineHeight: 20 }}
        >
          This app is entitled for Keeper.sh passkeys. A self-hosted server
          needs an app build whose webcredentials entitlement matches that
          server’s domain.
        </Text>
        <PrimaryButton
          label="Open Passkey Management"
          onPress={async () => {
            try {
              setError(null);
              await WebBrowser.openBrowserAsync(
                passkeyManagementUrl(profile.baseUrl),
              );
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not open passkey management.",
              );
            }
          }}
        />
        {error ? (
          <Text
            selectable
            accessibilityRole="alert"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
      </Screen>
    );

  return (
    <Screen>
      <Text selectable style={{ color: colors.secondaryLabel, lineHeight: 20 }}>
        Passkeys use Face ID, Touch ID, your device passcode, or your password
        manager to sign in without entering a Keeper password.
      </Text>
      <PrimaryButton
        busy={mutation?.kind === "add"}
        disabled={mutation !== null}
        label="Add a Passkey"
        onPress={add}
      />
      {loading ? (
        <LoadingState label="Loading passkeys…" />
      ) : error && passkeys.length === 0 ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Section
          title="Your Passkeys"
          footer="Tap a passkey to remove it from your Keeper account."
        >
          {passkeys.length === 0 ? (
            <EmptyState
              title="No passkeys yet"
              message="Add one to make sign-in faster and more secure."
            />
          ) : (
            passkeys.map((passkey) => (
              <Row
                key={passkey.id}
                disabled={mutation !== null}
                icon="person.badge.key"
                label={passkeyName(passkey)}
                detail={passkeyCreatedLabel(passkey)}
                onPress={() => confirmRemove(passkey)}
                trailing={
                  mutation?.kind === "delete" && mutation.id === passkey.id ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={{ color: colors.danger }}>Delete</Text>
                  )
                }
              />
            ))
          )}
        </Section>
      )}
      {error && passkeys.length > 0 ? (
        <Text
          selectable
          accessibilityRole="alert"
          style={{ color: colors.danger }}
        >
          {error}
        </Text>
      ) : null}
      {message ? (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          style={{ color: colors.success }}
        >
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
