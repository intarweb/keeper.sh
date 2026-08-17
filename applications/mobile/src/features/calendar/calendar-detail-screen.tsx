import { useEffect, useState } from "react";
import { BodyText as Text } from "@/components/typography";
import { useLocalSearchParams } from "expo-router";

import type {
  CalendarDetail,
  CalendarSummary,
  Entitlements,
} from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { Field, PrimaryButton, ToggleRow } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { asKeeperProvider } from "@/components/provider-icon";
import { Screen } from "@/components/screen";
import { ErrorState, LoadingState, StaleBanner } from "@/components/states";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import { logProductEvent } from "@/observability/consent";
import { toggleMappingSelection } from "@/features/accounts/setup-logic";
import {
  buildCalendarSettingsPatch,
  isPullCapable,
  isPushCapable,
  SYNC_RANGE_OPTIONS,
  toggleEventName,
} from "./calendar-settings-logic";

function InfoValue({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <Row label={label} detail={value} />;
}

export function CalendarDetailScreen() {
  const { calendarId = "" } = useLocalSearchParams<{ calendarId?: string }>();
  const { api } = useApp();
  const resource = useApiResource<CalendarDetail>(
    `/api/sources/${calendarId}`,
    Boolean(calendarId),
  );
  const all = useApiResource<CalendarSummary[]>("/api/sources");
  const entitlements = useApiResource<Entitlements>("/api/entitlements");
  const [draft, setDraft] = useState<CalendarDetail | null>(null);
  const [initialDestinationIds, setInitialDestinationIds] = useState<string[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!resource.data) return;
    setDraft(resource.data);
    setInitialDestinationIds(resource.data.destinationIds);
  }, [resource.data]);

  if (resource.loading && !draft) return <LoadingState />;
  if (resource.error || !draft)
    return (
      <ErrorState
        message={resource.error ?? "Calendar not found."}
        onRetry={() => void resource.refresh()}
      />
    );

  const set = <K extends keyof CalendarDetail>(
    key: K,
    value: CalendarDetail[K],
  ) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const pull = isPullCapable(draft);
  const push = isPushCapable(draft);
  const entitlementLoading = entitlements.loading || !entitlements.data;
  const advancedLocked =
    entitlementLoading || !entitlements.data?.canUseEventFilters;
  const summary = all.data?.find(({ id }) => id === calendarId);
  const destinations = (all.data ?? []).filter(
    (item) => item.id !== calendarId && item.capabilities.includes("push"),
  );
  const mappingLimit = entitlements.data?.mappings ?? { current: 0, limit: 0 };

  const toggleDestination = (candidateId: string) => {
    if (entitlementLoading) return;
    const result = toggleMappingSelection({
      candidateId,
      initialIds: initialDestinationIds,
      selectedIds: draft.destinationIds,
      limit: mappingLimit,
    });
    if (result.blocked) {
      setMessage(
        "Mapping limit reached. Remove a mapping or upgrade before adding another.",
      );
      return;
    }
    setMessage(null);
    set("destinationIds", result.selectedIds);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.client.updateCalendar(
        calendarId,
        buildCalendarSettingsPatch(
          draft,
          Boolean(entitlements.data?.canUseEventFilters),
        ),
      );
      if (pull)
        await api.client.setSourceDestinations(calendarId, {
          calendarIds: draft.destinationIds,
        });
      logProductEvent("calendar.settings_saved", {
        canPull: pull,
        canPush: push,
        destinationCount: draft.destinationIds.length,
      });
      await Promise.all([
        resource.refresh(),
        all.refresh(),
        entitlements.refresh(),
      ]);
      setMessage(
        "Calendar settings saved. Keeper will reconcile affected events.",
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Could not save settings. Your edits are still here so you can retry.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {resource.stale ? <StaleBanner updatedAt={resource.updatedAt} /> : null}
      <Section>
        <Row
          label={draft.name}
          detail={`${draft.providerName} · ${draft.calendarType}`}
          provider={asKeeperProvider(draft.provider) ?? undefined}
        />
      </Section>
      <Field
        label="Calendar Name in Keeper"
        value={draft.name}
        onChangeText={(value) => set("name", value)}
        autoCapitalize="words"
      />

      {pull ? (
        <Section
          title="Send Events To"
          footer={`Mappings used: ${entitlements.data?.mappings.current ?? "checking"} of ${entitlements.data?.mappings.limit ?? "unlimited"}.`}
        >
          {destinations.length ? (
            destinations.map((destination) => {
              const checked = draft.destinationIds.includes(destination.id);
              const atLimit =
                mappingLimit.limit !== null &&
                mappingLimit.current -
                  initialDestinationIds.length +
                  draft.destinationIds.length >=
                  mappingLimit.limit;
              return (
                <Row
                  key={destination.id}
                  label={destination.name}
                  detail={destination.accountLabel}
                  disabled={entitlementLoading || (!checked && atLimit)}
                  selected={checked}
                  selectionRole="checkbox"
                  onPress={() => toggleDestination(destination.id)}
                  trailing={
                    <Text style={{ color: colors.accent }}>
                      {checked ? "✓" : ""}
                    </Text>
                  }
                />
              );
            })
          ) : (
            <Row
              label="No destination calendars available"
              detail="Connect a push-capable calendar first."
            />
          )}
        </Section>
      ) : null}

      {push ? (
        <>
          <Section
            title="Historic Sync Range"
            footer={
              advancedLocked && !entitlementLoading
                ? "Custom sync windows require Pro."
                : undefined
            }
          >
            {SYNC_RANGE_OPTIONS.map((range) => (
              <Row
                key={range.value}
                label={range.label}
                disabled={advancedLocked}
                selected={draft.syncHistoricRange === range.value}
                selectionRole="radio"
                onPress={() => set("syncHistoricRange", range.value)}
                trailing={
                  <Text style={{ color: colors.accent }}>
                    {draft.syncHistoricRange === range.value ? "✓" : ""}
                  </Text>
                }
              />
            ))}
          </Section>
          <Section
            title="Future Sync Range"
            footer="Narrowing a range removes already-synced events outside it from this calendar."
          >
            {SYNC_RANGE_OPTIONS.map((range) => (
              <Row
                key={range.value}
                label={range.label}
                disabled={advancedLocked}
                selected={draft.syncFutureRange === range.value}
                selectionRole="radio"
                onPress={() => set("syncFutureRange", range.value)}
                trailing={
                  <Text style={{ color: colors.accent }}>
                    {draft.syncFutureRange === range.value ? "✓" : ""}
                  </Text>
                }
              />
            ))}
          </Section>
        </>
      ) : null}

      {pull ? (
        <>
          <Section
            title="Sync Settings"
            footer={
              advancedLocked && !entitlementLoading
                ? "Advanced event filters require Pro."
                : undefined
            }
          >
            <ToggleRow
              label="Sync Event Name"
              value={!draft.excludeEventName}
              onValueChange={(value) =>
                setDraft((current) =>
                  current ? { ...current, ...toggleEventName(value) } : current,
                )
              }
              disabled={advancedLocked}
            />
            <ToggleRow
              label="Sync Event Description"
              value={!draft.excludeEventDescription}
              onValueChange={(value) => set("excludeEventDescription", !value)}
              disabled={advancedLocked}
            />
            <ToggleRow
              label="Sync Event Location"
              value={!draft.excludeEventLocation}
              onValueChange={(value) => set("excludeEventLocation", !value)}
              disabled={advancedLocked}
            />
            {draft.calendarType === "ical" ? (
              <ToggleRow
                label="Sync Full-Day Events as All-Day"
                detail="Treat full-day timed ICS entries as all-day events."
                value={draft.treatFullDayTimedEventsAsAllDay}
                onValueChange={(value) =>
                  set("treatFullDayTimedEventsAsAllDay", value)
                }
                disabled={advancedLocked}
              />
            ) : null}
          </Section>
          <Field
            label="Event Name Template"
            value={draft.customEventName}
            onChangeText={(value) => set("customEventName", value)}
            editable={!advancedLocked && draft.excludeEventName}
            autoCapitalize="sentences"
          />
          <Section title="Exclusions">
            <ToggleRow
              label="Exclude All-Day Events"
              value={draft.excludeAllDayEvents}
              onValueChange={(value) => set("excludeAllDayEvents", value)}
              disabled={advancedLocked}
            />
            {draft.provider === "google" ? (
              <>
                <ToggleRow
                  label="Exclude Focus Time Events"
                  value={draft.excludeFocusTime}
                  onValueChange={(value) => set("excludeFocusTime", value)}
                  disabled={advancedLocked}
                />
                <ToggleRow
                  label="Exclude Out of Office Events"
                  value={draft.excludeOutOfOffice}
                  onValueChange={(value) => set("excludeOutOfOffice", value)}
                  disabled={advancedLocked}
                />
              </>
            ) : null}
          </Section>
        </>
      ) : null}

      <Section title="Calendar Information">
        <InfoValue label="Account" value={summary?.accountLabel} />
        <InfoValue label="Provider" value={draft.providerName} />
        <InfoValue label="Type" value={draft.calendarType} />
        <InfoValue
          label="Capabilities"
          value={draft.capabilities.join(" + ") || "None"}
        />
        <InfoValue label="Original Name" value={draft.originalName} />
        <InfoValue label="URL" value={draft.url} />
        <InfoValue label="Calendar URL" value={draft.calendarUrl} />
        <InfoValue
          label="Added"
          value={new Date(draft.createdAt).toLocaleString()}
        />
      </Section>
      {message ? (
        <Text
          selectable
          style={{
            color: message.startsWith("Calendar settings saved")
              ? colors.secondaryLabel
              : colors.danger,
          }}
        >
          {message}
        </Text>
      ) : null}
      <PrimaryButton
        busy={busy}
        disabled={!draft.name.trim()}
        label="Save Calendar Settings"
        onPress={save}
      />
    </Screen>
  );
}
