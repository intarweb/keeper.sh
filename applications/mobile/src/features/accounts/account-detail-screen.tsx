import { Alert } from "react-native";
import { BodyText as Text } from "@/components/typography";
import { router, useLocalSearchParams } from "expo-router";

import type { CalendarAccount, CalendarSummary } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { ErrorState, LoadingState } from "@/components/states";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export function AccountDetailScreen() {
  const { accountId = "" } = useLocalSearchParams<{ accountId?: string }>();
  const { api } = useApp();
  const account = useApiResource<CalendarAccount>(
    `/api/accounts/${accountId}`,
    {
      enabled: Boolean(accountId),
      load: (signal) => api.client.getAccount(accountId, signal),
    },
  );
  const calendars = useApiResource<CalendarSummary[]>("/api/sources", {
    load: (signal) => api.client.listSources(signal),
  });
  if (account.loading && !account.data) return <LoadingState />;
  if (account.error || !account.data)
    return <ErrorState message={account.error ?? "Account not found."} />;
  const items = (calendars.data ?? []).filter(
    (calendar) => calendar.accountId === accountId,
  );
  const remove = () =>
    Alert.alert(
      "Delete calendar account?",
      "This removes the account, its calendars, and affected sync mappings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await api.client.deleteAccount(accountId);
            router.replace("/(tabs)/calendars");
          },
        },
      ],
    );
  return (
    <Screen>
      {account.data.needsReauthentication ? (
        <Section title="Action Required">
          <Row
            icon="exclamationmark.triangle"
            label="Reconnect this account"
            detail="Its provider authorization has expired."
            href="/(tabs)/today/sync-control"
          />
        </Section>
      ) : null}
      <Section title="Account Information">
        <Row label="Provider" detail={account.data.providerName} />
        <Row
          label="Identifier"
          detail={account.data.accountIdentifier ?? account.data.email ?? "—"}
        />
        <Row label="Authentication" detail={account.data.authType} />
        <Row
          label="Connected"
          detail={new Date(account.data.createdAt).toLocaleString()}
        />
      </Section>
      <Section title="Calendars">
        {items.length ? (
          items.map((calendar) => (
            <Row
              key={calendar.id}
              icon="calendar"
              label={calendar.name}
              detail={calendar.calendarType}
              href={`/calendar/${calendar.id}?accountId=${accountId}`}
            />
          ))
        ) : (
          <Text style={{ padding: 14, color: colors.secondaryLabel }}>
            No calendars
          </Text>
        )}
      </Section>
      <Row
        icon="slider.horizontal.3"
        label="Review Setup & Mappings"
        href={`/account/${accountId}/setup`}
      />
      <PrimaryButton destructive label="Delete Account" onPress={remove} />
    </Screen>
  );
}
