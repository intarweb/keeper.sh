import { useState } from "react";
import { Alert } from "react-native";
import { BodyText as Text } from "@/components/typography";
import * as Clipboard from "expo-clipboard";
import type { ApiTokenCreated } from "@keeper.sh/api-contracts";

import type { ApiToken } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { Field, PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { successHaptic } from "@/design/haptics";
import { useApp } from "@/providers/app-provider";

type Token = ApiToken;

export function ApiTokensScreen() {
  const { api } = useApp();
  const resource = useApiResource<Token[]>("/api/tokens", {
    cache: "none",
    load: (signal) => api.client.listApiTokens(signal),
  });
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    try {
      const created: ApiTokenCreated = await api.client.createApiToken({
        name,
      });
      setRevealed(created.token);
      setName("");
      await resource.refresh();
      await successHaptic();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create token.",
      );
    }
  };
  const revoke = (token: Token) =>
    Alert.alert(
      "Revoke API token?",
      `${token.name} will stop working immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            await api.client.deleteApiToken(token.id);
            await resource.refresh();
            await successHaptic();
          },
        },
      ],
    );
  return (
    <Screen>
      <Text selectable style={{ color: colors.secondaryLabel, lineHeight: 20 }}>
        API tokens grant programmatic access to your Keeper data. Store them
        securely; each value is shown once.
      </Text>
      <Field
        label="Token name"
        value={name}
        onChangeText={setName}
        placeholder="Calendar script"
      />
      <PrimaryButton
        disabled={!name.trim()}
        label="Create API token"
        onPress={create}
      />
      {revealed ? (
        <Section
          title="Copy this token now"
          footer="It will not be shown again."
        >
          <Row
            monospace
            label={revealed}
            onPress={async () => {
              await Clipboard.setStringAsync(revealed);
              await successHaptic();
            }}
            trailing={<Text style={{ color: colors.label }}>Copy</Text>}
          />
        </Section>
      ) : null}
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <Section title="Active tokens">
        {(resource.data ?? []).map((token) => (
          <Row
            key={token.id}
            label={token.name}
            detail={`${token.tokenPrefix ?? "kpr_…"} · Created ${new Date(token.createdAt).toLocaleDateString()}`}
            destructive
            onPress={() => revoke(token)}
            trailing={<Text style={{ color: colors.danger }}>Revoke</Text>}
          />
        ))}
      </Section>
    </Screen>
  );
}
