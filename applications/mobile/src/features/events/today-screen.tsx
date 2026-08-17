import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Pressable, RefreshControl, SectionList, View } from "react-native";

import type { KeeperEvent } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleBanner,
} from "@/components/states";
import { Row, Section } from "@/components/native-list";
import { ProviderIcon, asKeeperProvider } from "@/components/provider-icon";
import { BodyText, MutedText } from "@/components/typography";
import { colors } from "@/design/colors";
import { keeperFonts, keeperRadii, keeperShadow } from "@/design/tokens";
import { successHaptic } from "@/design/haptics";
import { useApp } from "@/providers/app-provider";
import { useSyncSocket } from "@/features/sync/use-sync-socket";
import { syncStatusLabel } from "@/features/sync/realtime-logic";
import { KeeperApiError } from "@keeper.sh/api-client";
import {
  eventDayLabel,
  eventDisplayTitle,
  eventTimeLabel,
} from "./event-display-logic";

function rangePath(daysBefore = 1, daysAfter = 30) {
  const from = new Date();
  from.setDate(from.getDate() - daysBefore);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + daysAfter);
  to.setHours(23, 59, 59, 999);
  return `/api/v1/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

export function TodayScreen() {
  const { api } = useApp();
  const [daysAfter, setDaysAfter] = useState(30);
  const path = rangePath(1, daysAfter);
  const resource = useApiResource<KeeperEvent[]>(path, {
    load: (signal) => {
      const url = new URL(path, "https://keeper.invalid");
      return api.client.listV1Events(
        {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        },
        signal,
      );
    },
  });
  const live = useSyncSocket();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const sections = useMemo(() => {
    const grouped = new Map<string, KeeperEvent[]>();
    for (const event of resource.data ?? []) {
      const key = eventDayLabel(event);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return [...grouped].map(([title, data]) => ({ title, data }));
  }, [resource.data]);

  const triggerSync = async () => {
    try {
      const result = await api.client.triggerV1Sync();
      setSyncMessage(
        result.triggered
          ? `Refreshing ${result.sourcesRefreshed} calendar${result.sourcesRefreshed === 1 ? "" : "s"}.`
          : "A sync is already running or was requested recently. Try again in about a minute.",
      );
      if (result.triggered) await successHaptic();
    } catch (reason) {
      const retry =
        reason instanceof KeeperApiError ? reason.retryAfterSeconds : null;
      setSyncMessage(
        retry != null
          ? `Sync is throttled. Try again in ${retry} seconds.`
          : reason instanceof Error
            ? reason.message
            : "Sync could not be started.",
      );
    }
  };

  const header = (
    <View style={{ gap: 12, paddingBottom: 18 }}>
      {resource.stale ? <StaleBanner updatedAt={resource.updatedAt} /> : null}
      <View
        style={{
          backgroundColor: colors.card,
          padding: 14,
          borderRadius: keeperRadii.surface,
          borderCurve: "continuous",
          borderColor: colors.borderElevated,
          borderWidth: 1,
          gap: 8,
          boxShadow: keeperShadow,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              backgroundColor:
                live.connected && live.hasReceivedAggregate
                  ? live.syncing
                    ? colors.warning
                    : live.remaining === 0
                      ? colors.success
                      : colors.warning
                  : colors.secondaryLabel,
            }}
          />
          <BodyText style={{ flex: 1, fontFamily: keeperFonts.bodyMedium }}>
            {syncStatusLabel(live)}
          </BodyText>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={triggerSync}
          >
            <BodyText style={{ fontFamily: keeperFonts.bodyMedium }}>
              Sync now
            </BodyText>
          </Pressable>
        </View>
        {syncMessage ? (
          <MutedText style={{ fontSize: 12 }}>{syncMessage}</MutedText>
        ) : null}
      </View>
      <Section title="Overview">
        <Row
          icon="envelope"
          label="Invitations"
          detail="Review and RSVP"
          href="/(tabs)/today/invitations"
        />
        <Row
          icon="chart.bar"
          label="Activity"
          detail="15-day calendar view"
          href="/(tabs)/today/activity"
        />
        <Row
          icon="arrow.triangle.2.circlepath"
          label="Sync control"
          detail="Pause and recover calendars"
          href="/(tabs)/today/sync-control"
        />
      </Section>
    </View>
  );

  if (resource.loading && !resource.data)
    return <LoadingState label="Loading your agenda…" />;
  if (resource.error)
    return <ErrorState message={resource.error} onRetry={resource.refresh} />;
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      sections={sections}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          title="Your agenda is clear"
          message="Connected calendar events will appear here."
        />
      }
      ListFooterComponent={
        sections.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDaysAfter((value) => Math.min(value + 30, 365))}
            disabled={daysAfter >= 365}
            style={{ padding: 16 }}
          >
            <BodyText
              style={{
                color: daysAfter >= 365 ? colors.secondaryLabel : colors.label,
                textAlign: "center",
                fontFamily: keeperFonts.bodyMedium,
              }}
            >
              {daysAfter >= 365 ? "Showing the next year" : "Load 30 more days"}
            </BodyText>
          </Pressable>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={resource.loading}
          onRefresh={resource.refresh}
        />
      }
      renderSectionHeader={({ section }) => (
        <BodyText
          style={{
            fontFamily: keeperFonts.bodyMedium,
            fontSize: 13,
            paddingVertical: 9,
            backgroundColor: colors.background,
          }}
        >
          {section.title}
        </BodyText>
      )}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/event/${item.id}`)}
          style={({ pressed }) => ({
            paddingHorizontal: 2,
            paddingVertical: 11,
            opacity: pressed ? 0.55 : 1,
            borderBottomWidth: 1,
            borderBottomColor: colors.separator,
            gap: 3,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {asKeeperProvider(item.calendarProvider) ? (
              <ProviderIcon
                provider={asKeeperProvider(item.calendarProvider)!}
                size={15}
              />
            ) : null}
            <MutedText style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {eventTimeLabel(item)} · {item.calendarName}
            </MutedText>
          </View>
          <BodyText
            numberOfLines={1}
            style={{ fontSize: 15, fontFamily: keeperFonts.bodyMedium }}
          >
            {eventDisplayTitle(item)}
          </BodyText>
        </Pressable>
      )}
    />
  );
}
