import { useMemo } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, View } from "react-native";

import type {
  CalendarAccount,
  CalendarSummary,
  Entitlements,
} from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleBanner,
} from "@/components/states";
import { ProviderIconStack } from "@/components/provider-icon";
import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";
import { useApp } from "@/providers/app-provider";

type ListItem = {
  kind: "account";
  account: CalendarAccount;
  calendars: CalendarSummary[];
};

export function CalendarsScreen() {
  const { api } = useApp();
  const accounts = useApiResource<CalendarAccount[]>("/api/accounts", {
    load: (signal) => api.client.listAccounts(signal),
  });
  const calendars = useApiResource<CalendarSummary[]>("/api/sources", {
    load: (signal) => api.client.listSources(signal),
  });
  const entitlements = useApiResource<Entitlements>("/api/entitlements", {
    load: (signal) => api.client.getEntitlements(signal),
  });
  const items = useMemo<ListItem[]>(
    () =>
      (accounts.data ?? []).map((account) => ({
        kind: "account",
        account,
        calendars: (calendars.data ?? []).filter(
          (calendar) => calendar.accountId === account.id,
        ),
      })),
    [accounts.data, calendars.data],
  );
  const refresh = async () =>
    Promise.all([
      accounts.refresh(),
      calendars.refresh(),
      entitlements.refresh(),
    ]).then(() => undefined);
  if ((accounts.loading || calendars.loading) && items.length === 0)
    return <LoadingState label="Loading calendars…" />;
  if (accounts.error || calendars.error)
    return (
      <ErrorState
        message={
          accounts.error ?? calendars.error ?? "Could not load calendars."
        }
        onRetry={refresh}
      />
    );
  const atLimit =
    entitlements.data?.accounts.limit != null &&
    entitlements.data.accounts.current >= entitlements.data.accounts.limit;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
      data={items}
      keyExtractor={(item) => item.account.id}
      refreshing={accounts.loading || calendars.loading}
      onRefresh={refresh}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {accounts.stale || calendars.stale ? (
            <StaleBanner
              updatedAt={Math.min(
                accounts.updatedAt ?? Date.now(),
                calendars.updatedAt ?? Date.now(),
              )}
            />
          ) : null}
          <Pressable
            disabled={atLimit}
            onPress={() => router.push("/(tabs)/calendars/connect")}
            style={({ pressed }) => ({
              minHeight: 58,
              padding: 14,
              borderRadius: keeperRadii.surface,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: colors.borderElevated,
              backgroundColor: pressed ? colors.backgroundHover : colors.card,
              opacity: atLimit ? 0.42 : 1,
              boxShadow: keeperShadow,
            })}
          >
            <BodyText
              style={{ fontFamily: keeperFonts.bodyMedium, fontSize: 15 }}
            >
              {atLimit ? "Account limit reached" : "Connect a calendar account"}
            </BodyText>
            <MutedText style={{ fontSize: 12 }}>
              {entitlements.data
                ? `${entitlements.data.accounts.current} of ${entitlements.data.accounts.limit ?? "unlimited"} accounts`
                : "Google, Microsoft, iCloud, Fastmail, CalDAV, or ICS"}
            </MutedText>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="No calendars connected"
          message="Connect a provider to begin syncing calendars."
          action="Connect calendar"
          onAction={() => router.push("/(tabs)/calendars/connect")}
        />
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: keeperRadii.surface,
            borderCurve: "continuous",
            borderColor: colors.borderElevated,
            borderWidth: 1,
            padding: 2,
            overflow: "hidden",
            boxShadow: keeperShadow,
          }}
        >
          <Pressable
            onPress={() => router.push(`/account/${item.account.id}`)}
            style={({ pressed }) => ({
              padding: 14,
              gap: 4,
              borderRadius: keeperRadii.row,
              backgroundColor: pressed ? colors.backgroundHover : "transparent",
            })}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ProviderIconStack providers={[item.account.provider]} />
              <View style={{ flex: 1, gap: 2 }}>
                <BodyText
                  numberOfLines={1}
                  style={{ fontFamily: keeperFonts.bodyMedium, fontSize: 15 }}
                >
                  {item.account.accountLabel}
                </BodyText>
                <MutedText style={{ fontSize: 12 }}>
                  {item.account.providerName} · {item.calendars.length} calendar
                  {item.calendars.length === 1 ? "" : "s"}
                </MutedText>
              </View>
              {item.account.needsReauthentication ? (
                <BodyText style={{ color: colors.warning, fontSize: 12 }}>
                  Reconnect
                </BodyText>
              ) : null}
            </View>
          </Pressable>
          {item.calendars.map((calendar) => (
            <Pressable
              key={calendar.id}
              onPress={() =>
                router.push(
                  `/calendar/${calendar.id}?accountId=${item.account.id}`,
                )
              }
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 11,
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                borderRadius: keeperRadii.row,
                backgroundColor: pressed
                  ? colors.backgroundHover
                  : "transparent",
              })}
            >
              <BodyText numberOfLines={1} style={{ flex: 1 }}>
                {calendar.name}
              </BodyText>
              <MutedText numberOfLines={1} style={{ fontSize: 12 }}>
                {calendar.calendarType}
              </MutedText>
            </Pressable>
          ))}
        </View>
      )}
    />
  );
}
