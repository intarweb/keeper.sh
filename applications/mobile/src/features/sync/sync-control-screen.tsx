import { useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { BodyText as Text } from "@/components/typography";
import type { ReauthenticationAccount } from "@keeper.sh/api-contracts";

import type { CalendarSummary, SyncDestinationStatus } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { resolveOAuthTicketDestination } from "@/auth/oauth-return";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";

export function SyncControlScreen() {
  const { api, auth, profile } = useApp();
  const calendars = useApiResource<CalendarSummary[]>("/api/sources", {
    load: (signal) => api.client.listSources(signal),
  });
  const statuses = useApiResource<SyncDestinationStatus[]>("/api/sync/status", {
    load: (signal) => api.client.getSyncStatuses(signal),
  });
  const recovery = useApiResource<ReauthenticationAccount[]>(
    "/api/mobile/reauthentication",
    {
      cache: "none",
      load: (signal) => api.client.listReauthenticationAccounts(signal),
    },
  );
  const [optimisticPaused, setOptimisticPaused] = useState<
    Record<string, boolean>
  >({});
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (calendar: CalendarSummary) => {
    const current = optimisticPaused[calendar.id] ?? calendar.disabled;
    const next = !current;
    setOptimisticPaused((values) => ({ ...values, [calendar.id]: next }));
    try {
      const result = await api.client.setV1CalendarPaused(calendar.id, next);
      setOptimisticPaused((values) => ({
        ...values,
        [calendar.id]: result.paused,
      }));
      await calendars.refresh();
      setOptimisticPaused((values) => {
        const copy = { ...values };
        delete copy[calendar.id];
        return copy;
      });
      setMessage(
        result.paused ? "Calendar sync paused." : "Calendar sync resumed.",
      );
    } catch (reason) {
      setOptimisticPaused((values) => {
        const copy = { ...values };
        delete copy[calendar.id];
        return copy;
      });
      setMessage(
        reason instanceof Error ? reason.message : "Could not update calendar.",
      );
    }
  };

  const reauthenticate = async (account: ReauthenticationAccount) => {
    if (account.recovery.method === "POST") {
      router.push(
        `/(tabs)/calendars/connect-provider?provider=${encodeURIComponent(account.provider)}&recovery=caldav`,
      );
      return;
    }
    try {
      const returnTo = Linking.createURL("oauth/callback");
      const separator = account.recovery.authorizePath.includes("?")
        ? "&"
        : "?";
      const response = await fetch(
        `${profile.baseUrl}${account.recovery.authorizePath}${separator}returnTo=${encodeURIComponent(returnTo)}`,
        {
          headers: { Cookie: auth.getCookie() },
          redirect: "manual",
        },
      );
      const result = await WebBrowser.openAuthSessionAsync(
        response.headers.get("location") ?? response.url,
        returnTo,
      );
      if (result.type !== "success")
        throw new Error("Provider authorization was cancelled.");
      const ticket = new URL(result.url).searchParams.get("ticket");
      if (!ticket) throw new Error("Missing recovery ticket.");
      const redeemed = await api.client.redeemMobileOAuthTicket(ticket);
      resolveOAuthTicketDestination(redeemed, "/(tabs)/today/sync-control");
      await recovery.refresh();
      setMessage("Account reconnected.");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Reauthentication failed.",
      );
    }
  };

  return (
    <Screen>
      {(recovery.data ?? []).length ? (
        <Section title="Action Required">
          {recovery.data!.map((account) => (
            <Row
              key={account.id}
              icon="exclamationmark.triangle"
              label={account.accountLabel}
              detail="Provider authorization expired"
              onPress={() => reauthenticate(account)}
              trailing={
                <Text style={{ color: colors.warning }}>Reconnect</Text>
              }
            />
          ))}
        </Section>
      ) : null}
      <Section
        title="Calendar Sync"
        footer="Pause state is stored by your Keeper server and shared across devices."
      >
        {(calendars.data ?? []).map((calendar) => {
          const status = statuses.data?.find(
            (item) => item.calendarId === calendar.id,
          );
          const paused = optimisticPaused[calendar.id] ?? calendar.disabled;
          return (
            <Row
              key={calendar.id}
              label={calendar.name}
              detail={
                paused
                  ? "Paused"
                  : status?.inSync
                    ? `In sync${status.lastSyncedAt ? ` · ${new Date(status.lastSyncedAt).toLocaleString()}` : ""}`
                    : status
                      ? "Sync needs attention"
                      : "Checking status"
              }
              selected={paused}
              selectionRole="checkbox"
              onPress={() => toggle(calendar)}
              trailing={
                <Text style={{ color: paused ? colors.warning : colors.label }}>
                  {paused ? "Resume" : "Pause"}
                </Text>
              }
            />
          );
        })}
      </Section>
      {message ? (
        <Text selectable style={{ color: colors.secondaryLabel }}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
