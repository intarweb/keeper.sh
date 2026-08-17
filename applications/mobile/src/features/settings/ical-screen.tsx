import { useEffect, useState } from "react";
import { Share } from "react-native";
import { BodyText as Text } from "@/components/typography";
import { TemplateText } from "@/components/brand";
import * as Clipboard from "expo-clipboard";
import type { IcalSettings } from "@keeper.sh/api-contracts";

import type { CalendarSummary, Entitlements } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { Field, PrimaryButton, ToggleRow } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { colors } from "@/design/colors";
import { successHaptic } from "@/design/haptics";
import { useApp } from "@/providers/app-provider";
import { logProductEvent } from "@/observability/consent";
import { includedIcalSourceCandidates } from "./ical-source-logic";

export function IcalScreen() {
  const { api } = useApp();
  const token = useApiResource<{ icalUrl: string | null; token: string }>(
    "/api/ical/token",
    { cache: "none", load: (signal) => api.client.getIcalToken(signal) },
  );
  const settings = useApiResource<IcalSettings>("/api/ical/settings", {
    load: (signal) => api.client.getIcalSettings(signal),
  });
  const calendars = useApiResource<CalendarSummary[]>("/api/sources", {
    load: (signal) => api.client.listSources(signal),
  });
  const entitlements = useApiResource<Entitlements>("/api/entitlements", {
    load: (signal) => api.client.getEntitlements(signal),
  });
  const [draft, setDraft] = useState<IcalSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  const toggleCalendar = async (calendar: CalendarSummary) => {
    try {
      await api.client.updateCalendar(calendar.id, {
        includeInIcalFeed: !calendar.includeInIcalFeed,
      });
      logProductEvent("ical.source_toggled", {
        enabled: !calendar.includeInIcalFeed,
      });
      await calendars.refresh();
      await successHaptic();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not update feed.",
      );
    }
  };
  const save = async () => {
    if (!draft) return;
    try {
      const {
        includeEventName,
        includeEventDescription,
        includeEventLocation,
        excludeAllDayEvents,
        customEventName,
      } = draft;
      await api.client.updateIcalSettings({
        includeEventName,
        includeEventDescription,
        includeEventLocation,
        excludeAllDayEvents,
        customEventName,
      });
      logProductEvent("ical.settings_saved", {
        includeDescription: includeEventDescription,
        includeLocation: includeEventLocation,
        includeName: includeEventName,
      });
      setMessage("Feed privacy settings saved.");
      await successHaptic();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Could not save feed.",
      );
    }
  };
  const locked = entitlements.data
    ? !entitlements.data.canCustomizeIcalFeed
    : true;

  return (
    <Screen>
      <Text selectable style={{ color: colors.warning, lineHeight: 20 }}>
        Anyone with this private URL can view the event details you include.
        Revoke access from the web dashboard if the link is exposed.
      </Text>
      <Section title="Private iCal URL">
        <Row
          monospace
          label={token.data?.icalUrl ?? "No feed URL available"}
          onPress={
            token.data?.icalUrl
              ? async () => {
                  await Clipboard.setStringAsync(token.data!.icalUrl!);
                  await successHaptic();
                }
              : undefined
          }
          trailing={<Text style={{ color: colors.label }}>Copy</Text>}
        />
        <Row
          icon="square.and.arrow.up"
          label="Share Link"
          disabled={!token.data?.icalUrl}
          onPress={() => Share.share({ message: token.data!.icalUrl! })}
        />
      </Section>
      <Section title="Included Calendars">
        {includedIcalSourceCandidates(calendars.data ?? []).map((calendar) => (
          <Row
            key={calendar.id}
            label={calendar.name}
            selected={calendar.includeInIcalFeed}
            selectionRole="checkbox"
            onPress={() => toggleCalendar(calendar)}
            trailing={
              <Text style={{ color: colors.accent }}>
                {calendar.includeInIcalFeed ? "✓" : ""}
              </Text>
            }
          />
        ))}
      </Section>
      {draft ? (
        <>
          <Section
            title="Feed Privacy"
            footer={locked ? "Custom feed settings require Pro." : undefined}
          >
            <ToggleRow
              label="Include event names"
              value={draft.includeEventName}
              disabled={locked}
              onValueChange={(value) =>
                setDraft({ ...draft, includeEventName: value })
              }
            />
            <ToggleRow
              label="Include descriptions"
              value={draft.includeEventDescription}
              disabled={locked}
              onValueChange={(value) =>
                setDraft({ ...draft, includeEventDescription: value })
              }
            />
            <ToggleRow
              label="Include locations"
              value={draft.includeEventLocation}
              disabled={locked}
              onValueChange={(value) =>
                setDraft({ ...draft, includeEventLocation: value })
              }
            />
            <ToggleRow
              label="Exclude all-day events"
              value={draft.excludeAllDayEvents}
              disabled={locked}
              onValueChange={(value) =>
                setDraft({ ...draft, excludeAllDayEvents: value })
              }
            />
          </Section>
          <TemplateText>
            {"Template variables: {{title}} · {{calendar}}"}
          </TemplateText>
          <Field
            label="Redacted event name"
            value={draft.customEventName}
            onChangeText={(value) =>
              setDraft({ ...draft, customEventName: value })
            }
          />
          <PrimaryButton
            disabled={locked}
            label="Save Feed Settings"
            onPress={save}
          />
        </>
      ) : null}
      {message ? (
        <Text selectable style={{ color: colors.secondaryLabel }}>
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
