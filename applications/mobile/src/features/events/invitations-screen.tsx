import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { BodyText as Text } from "@/components/typography";

import type { PendingInvite } from "@/api/domain";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ProviderIcon, asKeeperProvider } from "@/components/provider-icon";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";
import { successHaptic } from "@/design/haptics";
import { useApp } from "@/providers/app-provider";
import { summarizeInvitationResults } from "./invitation-load-logic";
import {
  invitationOccurrenceKey,
  removeInvitationOccurrence,
} from "./invitation-load-logic";
import { logProductEvent } from "@/observability/consent";

export function InvitationsScreen() {
  const { api } = useApp();
  const [items, setItems] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const calendars = (await api.client.listSources()).filter((calendar) =>
        calendar.capabilities.includes("pull"),
      );
      const from = new Date();
      const to = new Date();
      to.setMonth(to.getMonth() + 6);
      const results = await Promise.allSettled(
        calendars.map((calendar) =>
          api.client.listV1Invites(calendar.id, {
            from: from.toISOString(),
            to: to.toISOString(),
          }),
        ),
      );
      const summary = summarizeInvitationResults(results);
      if (summary.failed === calendars.length && calendars.length > 0)
        throw new Error("Could not load invitations from any calendar.");
      setItems(
        summary.items.sort((a, b) => a.startTime.localeCompare(b.startTime)),
      );
      if (summary.failed)
        setWarning(
          `Invitations from ${summary.failed} calendar${summary.failed === 1 ? "" : "s"} could not be loaded. Pull to retry.`,
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load invitations.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const rsvp = async (
    invite: PendingInvite,
    status: "accepted" | "declined" | "tentative",
  ) => {
    try {
      await api.client.rsvpV1Invite(invite.calendarId, invite.sourceEventUid, {
        rsvpStatus: status,
        occurrenceStart: invite.startTime,
        ...(invite.sourceEventId && { sourceEventId: invite.sourceEventId }),
      });
      setItems((current) => removeInvitationOccurrence(current, invite));
      logProductEvent("invitation.responded", { response: status });
      await successHaptic();
    } catch (reason) {
      Alert.alert(
        "RSVP failed",
        reason instanceof Error ? reason.message : "Try again.",
      );
    }
  };
  if (loading && items.length === 0) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      data={items}
      keyExtractor={invitationOccurrenceKey}
      refreshing={loading}
      onRefresh={refresh}
      ListHeaderComponent={
        warning ? (
          <Text selectable style={{ color: colors.warning, lineHeight: 19 }}>
            {warning}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          title="No pending invitations"
          message="New calendar invitations will appear here."
        />
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: keeperRadii.surface,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: colors.borderElevated,
            padding: 14,
            gap: 7,
            boxShadow: keeperShadow,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {asKeeperProvider(item.provider) ? (
              <ProviderIcon
                provider={asKeeperProvider(item.provider)!}
                size={20}
              />
            ) : null}
            <Text
              selectable
              style={{ color: colors.label, fontWeight: "600", fontSize: 16 }}
            >
              {item.title ?? "Calendar invitation"}
            </Text>
          </View>
          <Text selectable style={{ color: colors.secondaryLabel }}>
            {new Date(item.startTime).toLocaleString()}
            {item.organizer ? ` · ${item.organizer}` : ""}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["accepted", "tentative", "declined"] as const).map((status) => (
              <Pressable
                key={status}
                onPress={() => rsvp(item, status)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: keeperRadii.control,
                  borderWidth: 1,
                  borderColor:
                    status === "declined"
                      ? colors.dangerBorder
                      : colors.separator,
                  backgroundColor:
                    status === "declined"
                      ? colors.dangerBackground
                      : colors.card,
                }}
              >
                <Text
                  style={{
                    color: status === "declined" ? colors.danger : colors.label,
                    textTransform: "capitalize",
                    fontFamily: keeperFonts.bodyMedium,
                  }}
                >
                  {status === "accepted"
                    ? "Accept"
                    : status === "declined"
                      ? "Decline"
                      : "Maybe"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    />
  );
}
