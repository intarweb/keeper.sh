import { useCallback, useRef, useState } from "react";
import { Alert, Share } from "react-native";
import { BodyText as Text } from "@/components/typography";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";

import type { KeeperEvent } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { ErrorState, LoadingState } from "@/components/states";
import { colors } from "@/design/colors";
import { successHaptic } from "@/design/haptics";
import { useApp } from "@/providers/app-provider";
import { logProductEvent } from "@/observability/consent";
import {
  canMutateEvent,
  eventDateRangeLabel,
  eventDisplayTitle,
  eventShareText,
} from "./event-display-logic";

export function EventDetailScreen() {
  const { eventId = "" } = useLocalSearchParams<{ eventId?: string }>();
  const { api } = useApp();
  const resource = useApiResource<KeeperEvent>(
    `/api/v1/events/${encodeURIComponent(eventId)}`,
    {
      cache: "none",
      enabled: Boolean(eventId),
      load: (signal) => api.client.getV1Event(eventId, signal),
    },
  );
  const [message, setMessage] = useState<string | null>(null);
  const hasFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocused.current) void resource.refresh();
      else hasFocused.current = true;
    }, [resource.refresh]),
  );
  if (resource.loading && !resource.data) return <LoadingState />;
  if (resource.error || !resource.data)
    return (
      <ErrorState
        message={resource.error ?? "Event not found."}
        onRetry={resource.refresh}
      />
    );
  const event = resource.data;
  const mutable = canMutateEvent(event);
  const shareText = eventShareText(event);
  const remove = () =>
    Alert.alert(
      "Delete event?",
      "This removes the event from its provider calendar.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setMessage(null);
            try {
              await api.client.deleteV1Event(event.id);
              logProductEvent("event.deleted", { allDay: event.isAllDay });
              await successHaptic();
              router.back();
            } catch (reason) {
              setMessage(
                reason instanceof Error
                  ? reason.message
                  : "Could not delete the event. Try again.",
              );
            }
          },
        },
      ],
    );
  return (
    <Screen>
      <Text
        selectable
        style={{
          color: colors.label,
          fontSize: 24,
          fontWeight: "700",
          lineHeight: 30,
        }}
      >
        {eventDisplayTitle(event)}
      </Text>
      <Text selectable style={{ color: colors.secondaryLabel }}>
        {eventDateRangeLabel(event)}
      </Text>
      <Section title="Event">
        <Row label="Calendar" detail={event.calendarName} />
        {event.location ? (
          <Row label="Location" detail={event.location} />
        ) : null}
        {event.description ? (
          <Row label="Description" detail={event.description} />
        ) : null}
      </Section>
      <Section title="Actions">
        <Row
          icon="square.and.arrow.up"
          label="Share Event"
          onPress={async () => {
            await Share.share({ message: shareText });
            logProductEvent("event.shared", { allDay: event.isAllDay });
          }}
        />
        <Row
          icon="doc.on.doc"
          label="Copy Details"
          onPress={async () => {
            await Clipboard.setStringAsync(shareText);
            logProductEvent("event.details_copied", { allDay: event.isAllDay });
            await successHaptic();
          }}
        />
        {mutable ? (
          <Row
            icon="pencil"
            label="Edit Event"
            href={`/event/${event.id}/edit`}
          />
        ) : null}
        {event.calendarUrl ? (
          <Row
            icon="arrow.up.right.square"
            label="Open in Provider"
            onPress={() =>
              void import("expo-linking").then(({ openURL }) =>
                openURL(event.calendarUrl!),
              )
            }
          />
        ) : null}
      </Section>
      {!mutable ? (
        <Text
          selectable
          style={{ color: colors.secondaryLabel, lineHeight: 19 }}
        >
          This event is managed by its source calendar. Edit or delete it in the
          provider.
        </Text>
      ) : null}
      {message ? (
        <Text selectable style={{ color: colors.danger }}>
          {message}
        </Text>
      ) : null}
      {mutable ? (
        <PrimaryButton destructive label="Delete Event" onPress={remove} />
      ) : null}
    </Screen>
  );
}
