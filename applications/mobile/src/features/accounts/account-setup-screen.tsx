import { useEffect, useMemo, useState } from "react";
import { Pressable } from "react-native";
import { BodyText as Text } from "@/components/typography";
import { router, useLocalSearchParams } from "expo-router";

import type { CalendarSummary, Entitlements } from "@/api/domain";
import { useApiResource } from "@/api/use-api-resource";
import { Field, PrimaryButton } from "@/components/form-controls";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StaleBanner,
} from "@/components/states";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import { logProductEvent } from "@/observability/consent";
import {
  buildSetupWorkflow,
  nextCalendarIndex,
  nextSetupStep,
  toggleMappingSelection,
  type MappingLimit,
  type SetupStep,
} from "./setup-logic";

function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function MappingStep({
  calendar,
  candidates,
  route,
  responseKey,
  limit,
  limitLoading,
  onSaved,
  onEntitlementsChanged,
}: {
  calendar: CalendarSummary;
  candidates: CalendarSummary[];
  route: "destinations" | "sources";
  responseKey: "destinationIds" | "sourceIds";
  limit: MappingLimit;
  limitLoading: boolean;
  onSaved(): void;
  onEntitlementsChanged(): Promise<void>;
}) {
  const { api } = useApp();
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Record<typeof responseKey, string[]>>(
        `/api/sources/${calendar.id}/${route}`,
      );
      const ids = result[responseKey] ?? [];
      setInitialIds(ids);
      setSelectedIds(ids);
      setHasLoaded(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load this calendar's mappings.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [calendar.id, route]);

  const toggle = (candidateId: string) => {
    const result = toggleMappingSelection({
      candidateId,
      initialIds,
      selectedIds,
      limit,
    });
    if (result.blocked || limitLoading) {
      setLimitMessage(
        limitLoading
          ? "Checking your plan limits…"
          : "Mapping limit reached. Remove a mapping or upgrade to add another.",
      );
      return;
    }
    setLimitMessage(null);
    setSelectedIds(result.selectedIds);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/sources/${calendar.id}/${route}`, {
        calendarIds: selectedIds,
      });
      logProductEvent("setup.mapping_saved", {
        direction: route === "destinations" ? "outgoing" : "incoming",
        mappingCount: selectedIds.length,
      });
      await onEntitlementsChanged();
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save these mappings.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading current mappings…" />;
  if (error && !hasLoaded)
    return <ErrorState message={error} onRetry={() => void load()} />;

  const title =
    route === "destinations"
      ? `Where should “${calendar.name}” send events?`
      : `Where should “${calendar.name}” pull events from?`;
  return (
    <>
      <Text
        selectable
        style={{
          color: colors.label,
          fontSize: 22,
          fontWeight: "700",
          lineHeight: 28,
        }}
      >
        {title}
      </Text>
      <Text selectable style={{ color: colors.secondaryLabel, lineHeight: 20 }}>
        {route === "destinations"
          ? "Choose calendars that should receive events from this calendar."
          : "Choose calendars that should send events into this calendar."}
      </Text>
      <Section
        title={
          route === "destinations"
            ? "Outgoing Destinations"
            : "Incoming Sources"
        }
      >
        {candidates.length ? (
          candidates.map((candidate) => {
            const checked = selectedIds.includes(candidate.id);
            const blocked =
              !checked &&
              (limitLoading ||
                (limit.limit !== null &&
                  limit.current - initialIds.length + selectedIds.length >=
                    limit.limit));
            return (
              <Row
                key={candidate.id}
                label={candidate.name}
                detail={candidate.accountLabel}
                disabled={blocked}
                selected={checked}
                selectionRole="checkbox"
                onPress={() => toggle(candidate.id)}
                trailing={
                  <Text style={{ color: colors.accent }}>
                    {checked ? "✓" : ""}
                  </Text>
                }
              />
            );
          })
        ) : (
          <EmptyState
            title="No calendars available"
            message={
              route === "destinations"
                ? "Connect a push-capable calendar to create an outgoing mapping."
                : "Connect a pull-capable calendar to create an incoming mapping."
            }
          />
        )}
      </Section>
      {limitMessage ? (
        <Text selectable style={{ color: colors.warning }}>
          {limitMessage}
        </Text>
      ) : null}
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton busy={saving} label="Save and Continue" onPress={save} />
    </>
  );
}

export function AccountSetupScreen() {
  const { accountId = "" } = useLocalSearchParams<{ accountId?: string }>();
  const { api } = useApp();
  const calendars = useApiResource<CalendarSummary[]>("/api/sources");
  const entitlements = useApiResource<Entitlements>("/api/entitlements");
  const [step, setStep] = useState<SetupStep>("select");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [calendarIndex, setCalendarIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCalendars = calendars.data ?? [];
  const accountCalendars = useMemo(
    () => allCalendars.filter((item) => item.accountId === accountId),
    [accountId, allCalendars],
  );
  const selectedCalendars = useMemo(
    () => accountCalendars.filter(({ id }) => selectedIds.includes(id)),
    [accountCalendars, selectedIds],
  );
  const workflow = useMemo(
    () => buildSetupWorkflow(selectedCalendars),
    [selectedCalendars],
  );
  const limit = entitlements.data?.mappings ?? { current: 0, limit: 0 };

  if (calendars.loading && !calendars.data)
    return <LoadingState label="Loading account calendars…" />;
  if (calendars.error && !calendars.data)
    return (
      <ErrorState
        message={calendars.error}
        onRetry={() => void calendars.refresh()}
      />
    );

  const finish = (completed: boolean) => {
    logProductEvent(completed ? "setup.completed" : "setup.skipped", {
      selectedCalendarCount: selectedCalendars.length,
    });
    router.replace("/(tabs)/calendars" as never);
  };
  const advanceStep = (current: SetupStep) => {
    const next = nextSetupStep(workflow, current);
    if (next === "finish") {
      finish(true);
      return;
    }
    setCalendarIndex(0);
    setStep(next);
  };
  const advanceCalendar = (stageCalendars: CalendarSummary[]) => {
    const next = nextCalendarIndex(calendarIndex, stageCalendars);
    if (next === "next-step") advanceStep(step);
    else setCalendarIndex(next);
  };

  const enterRename = () => {
    setDraftNames(
      Object.fromEntries(
        selectedCalendars.map((calendar) => [calendar.id, calendar.name]),
      ),
    );
    setStep("rename");
  };
  const saveRenames = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const calendar of selectedCalendars) {
        const name = draftNames[calendar.id]?.trim();
        if (name && name !== calendar.name)
          await api.client.updateCalendar(calendar.id, { name });
      }
      await calendars.refresh();
      advanceStep("rename");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save calendar names. You can retry without losing your edits.",
      );
    } finally {
      setSaving(false);
    }
  };

  const stepNumber = workflow.steps.indexOf(step) + 1;
  if (step === "select")
    return (
      <Screen>
        {calendars.stale ? (
          <StaleBanner updatedAt={calendars.updatedAt} />
        ) : null}
        <Text
          selectable
          style={{ color: colors.label, fontSize: 22, fontWeight: "700" }}
        >
          Which calendars would you like to configure?
        </Text>
        <Text
          selectable
          style={{ color: colors.secondaryLabel, lineHeight: 20 }}
        >
          Select calendars to rename and map. You can change these settings
          later.
        </Text>
        <Section title="Account Calendars">
          {accountCalendars.length ? (
            accountCalendars.map((calendar) => (
              <Row
                key={calendar.id}
                label={calendar.name}
                detail={
                  calendar.capabilities.join(" + ") || "No sync capabilities"
                }
                selected={selectedIds.includes(calendar.id)}
                selectionRole="checkbox"
                onPress={() =>
                  setSelectedIds((current) =>
                    current.includes(calendar.id)
                      ? current.filter((id) => id !== calendar.id)
                      : [...current, calendar.id],
                  )
                }
                trailing={
                  <Text style={{ color: colors.accent }}>
                    {selectedIds.includes(calendar.id) ? "✓" : ""}
                  </Text>
                }
              />
            ))
          ) : (
            <EmptyState
              title="No calendars found"
              message="Keeper did not find any calendars in this account. You can skip setup and reconnect later."
            />
          )}
        </Section>
        <PrimaryButton
          disabled={!selectedIds.length}
          label="Next"
          onPress={enterRename}
        />
        <GhostButton label="Skip Setup" onPress={() => finish(false)} />
      </Screen>
    );

  if (step === "rename")
    return (
      <Screen>
        <Text selectable style={{ color: colors.secondaryLabel }}>
          Step {stepNumber} of {workflow.steps.length}
        </Text>
        <Text
          selectable
          style={{ color: colors.label, fontSize: 22, fontWeight: "700" }}
        >
          Rename your calendars
        </Text>
        <Text
          selectable
          style={{ color: colors.secondaryLabel, lineHeight: 20 }}
        >
          These names are only used inside Keeper. Your provider calendar names
          stay unchanged.
        </Text>
        {selectedCalendars.map((calendar) => (
          <Field
            key={calendar.id}
            label={calendar.name}
            value={draftNames[calendar.id] ?? calendar.name}
            onChangeText={(name) =>
              setDraftNames((current) => ({ ...current, [calendar.id]: name }))
            }
            autoCapitalize="words"
          />
        ))}
        {error ? (
          <Text selectable style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
        <PrimaryButton
          busy={saving}
          disabled={selectedCalendars.some(
            (calendar) => !(draftNames[calendar.id] ?? calendar.name).trim(),
          )}
          label="Save and Continue"
          onPress={saveRenames}
        />
      </Screen>
    );

  const stageCalendars =
    step === "destinations"
      ? workflow.destinationCalendars
      : workflow.sourceCalendars;
  const calendar = stageCalendars[calendarIndex];
  const candidates = allCalendars.filter(
    (candidate) =>
      candidate.id !== calendar?.id &&
      candidate.capabilities.includes(
        step === "destinations" ? "push" : "pull",
      ),
  );
  return (
    <Screen>
      <Text selectable style={{ color: colors.secondaryLabel }}>
        Step {stepNumber} of {workflow.steps.length} · Calendar{" "}
        {Math.min(calendarIndex + 1, stageCalendars.length)} of{" "}
        {stageCalendars.length}
      </Text>
      {calendar ? (
        <MappingStep
          key={`${step}:${calendar.id}`}
          calendar={calendar}
          candidates={candidates}
          route={step}
          responseKey={step === "destinations" ? "destinationIds" : "sourceIds"}
          limit={limit}
          limitLoading={entitlements.loading || !entitlements.data}
          onEntitlementsChanged={entitlements.refresh}
          onSaved={() => advanceCalendar(stageCalendars)}
        />
      ) : (
        <>
          <EmptyState
            title="No setup needed"
            message={
              step === "destinations"
                ? "None of the selected calendars can send events."
                : "None of the selected calendars can receive events."
            }
          />
          <PrimaryButton
            label={step === "sources" ? "Finish" : "Continue"}
            onPress={() => advanceStep(step)}
          />
        </>
      )}
    </Screen>
  );
}
