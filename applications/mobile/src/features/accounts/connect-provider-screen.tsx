import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";

import { Field, PrimaryButton } from "@/components/form-controls";
import { ToggleRow } from "@/components/form-controls";
import { ProviderIcon, asKeeperProvider } from "@/components/provider-icon";
import { Screen } from "@/components/screen";
import { BodyText, EditorialHeading, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import { resolveOAuthTicketDestination } from "@/auth/oauth-return";

const providerUrls: Record<string, string> = {
  icloud: "https://caldav.icloud.com/",
  fastmail: "https://caldav.fastmail.com/",
};

export function ConnectProviderScreen() {
  const { provider = "", recovery } = useLocalSearchParams<{
    provider?: string;
    recovery?: string;
  }>();
  const { api, auth } = useApp();
  const [serverUrl, setServerUrl] = useState(providerUrls[provider] ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedRequiresAuth, setFeedRequiresAuth] = useState(false);
  const [feedUsername, setFeedUsername] = useState("");
  const [feedPassword, setFeedPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauth = ["google", "outlook", "microsoft"].includes(provider);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (oauth) {
        const returnTo = Linking.createURL("oauth/callback");
        const authorizeUrl = api.client.buildProviderAuthorizeUrl(
          "source",
          provider === "microsoft" ? "outlook" : provider,
          undefined,
          returnTo,
        );
        const response = await fetch(authorizeUrl, {
          headers: { Cookie: auth.getCookie() },
          redirect: "manual",
        });
        const authorizationUrl =
          response.headers.get("location") ?? response.url;
        const result = await WebBrowser.openAuthSessionAsync(
          authorizationUrl,
          returnTo,
        );
        if (result.type !== "success")
          throw new Error("Provider authorization was cancelled.");
        const ticket = new URL(result.url).searchParams.get("ticket");
        if (!ticket)
          throw new Error("The provider did not return a connection ticket.");
        const redeemed = await api.client.redeemMobileOAuthTicket(ticket);
        router.replace(resolveOAuthTicketDestination(redeemed) as never);
        return;
      } else if (provider === "ical") {
        let url = feedUrl;
        if (feedRequiresAuth) {
          const parsed = new URL(feedUrl);
          parsed.username = feedUsername;
          parsed.password = feedPassword;
          url = parsed.toString();
        }
        const result = await api.client.createRemoteIcs({
          name: "iCal Feed",
          url,
        });
        if (result.accountId) {
          router.replace(`/account/${result.accountId}/setup`);
          return;
        }
      } else {
        const destinationRecovery = recovery === "caldav";
        const discovery = await api.client.discoverCaldav(
          { serverUrl, username, password },
          destinationRecovery ? "destination" : "source",
        );
        let accountId: string | undefined;
        for (const calendar of discovery.calendars) {
          if (destinationRecovery) {
            await api.client.connectCaldavDestination({
              calendarUrl: calendar.url,
              password,
              provider,
              serverUrl,
              username,
            });
          } else {
            const result = await api.client.createCaldavSource({
              authMethod: discovery.authMethod,
              calendarUrl: calendar.url,
              name: calendar.displayName,
              password,
              provider: provider as "caldav" | "fastmail" | "icloud",
              serverUrl,
              username,
            });
            accountId ??= result.accountId;
          }
        }
        if (destinationRecovery) {
          router.replace("/(tabs)/today/sync-control");
          return;
        }
        if (accountId) {
          router.replace(`/account/${accountId}/setup`);
          return;
        }
      }
      router.replace("/(tabs)/calendars");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not connect provider.",
      );
    } finally {
      setBusy(false);
    }
  };
  const feedIncomplete =
    !feedUrl || (feedRequiresAuth && (!feedUsername || !feedPassword));
  const providerVisual = asKeeperProvider(provider);
  const providerLabel =
    provider === "ical"
      ? "iCal feed"
      : provider === "caldav"
        ? "CalDAV"
        : provider;
  return (
    <Screen contentContainerStyle={{ maxWidth: 420 }}>
      <View style={{ alignItems: "center", gap: 10, paddingVertical: 8 }}>
        {providerVisual ? (
          <ProviderIcon provider={providerVisual} size={40} />
        ) : null}
        <EditorialHeading
          level={2}
          style={{ textTransform: "capitalize", textAlign: "center" }}
        >
          {recovery ? "Reconnect" : "Connect"} {providerLabel}
        </EditorialHeading>
        <MutedText style={{ textAlign: "center" }}>
          {oauth
            ? `Keeper opens ${providerLabel} in your browser. Your provider credentials are never shown to this app.`
            : "Connection details are encrypted in transit and sent only to your configured Keeper server."}
        </MutedText>
      </View>
      {provider === "ical" ? (
        <>
          <Field
            label="Calendar feed URL"
            value={feedUrl}
            onChangeText={setFeedUrl}
            keyboardType="url"
            placeholder="https://example.com/calendar.ics"
          />
          <ToggleRow
            label="Feed requires authentication"
            value={feedRequiresAuth}
            onValueChange={setFeedRequiresAuth}
          />
          {feedRequiresAuth ? (
            <>
              <Field
                label="Feed username"
                value={feedUsername}
                onChangeText={setFeedUsername}
              />
              <Field
                label="Feed password"
                value={feedPassword}
                onChangeText={setFeedPassword}
                secureTextEntry
              />
            </>
          ) : null}
        </>
      ) : oauth ? null : (
        <>
          <Field
            label="CalDAV server"
            value={serverUrl}
            onChangeText={setServerUrl}
            keyboardType="url"
          />
          <Field
            label={
              provider === "icloud"
                ? "Apple ID"
                : provider === "fastmail"
                  ? "Fastmail email"
                  : "Username"
            }
            value={username}
            onChangeText={setUsername}
          />
          <Field
            label="App-specific password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </>
      )}
      {error ? (
        <BodyText accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </BodyText>
      ) : null}
      <PrimaryButton
        busy={busy}
        disabled={
          !oauth &&
          (provider === "ical"
            ? feedIncomplete
            : !serverUrl || !username || !password)
        }
        label={`${recovery ? "Reconnect" : "Connect"} ${providerLabel}`}
        onPress={connect}
      />
    </Screen>
  );
}
