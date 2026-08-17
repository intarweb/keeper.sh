import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { BodyText as Text } from "@/components/typography";

import type { CalendarSummary, KeeperEvent } from "@/api/domain";
import { Field, PrimaryButton, ToggleRow } from "@/components/form-controls";
import { NativeDateTimeField } from "@/components/native-date-time-field";
import { Row, Section } from "@/components/native-list";
import { Screen } from "@/components/screen";
import { ErrorState, LoadingState } from "@/components/states";
import { colors } from "@/design/colors";
import { useApp } from "@/providers/app-provider";
import { logProductEvent } from "@/observability/consent";
import {
  buildEventDatePayload,
  normalizeAllDayRange,
  parseAllDayDate,
  parseEventDate,
  validateEventDateRange,
} from "./event-date-logic";
import { canMutateEvent } from "./event-display-logic";

export function EventFormScreen({ editing = false }: { editing?: boolean }) {
  const params = useLocalSearchParams<{
    eventId?: string;
    start?: string;
    end?: string;
  }>();
  const { api } = useApp();
  const defaultStart = new Date(Date.now() + 3_600_000);
  const defaultEnd = new Date(Date.now() + 7_200_000);
  const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
  const [calendarId, setCalendarId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState(() =>
    parseEventDate(params.start, defaultStart),
  );
  const [endTime, setEndTime] = useState(() =>
    parseEventDate(params.end, defaultEnd),
  );
  const [isAllDay, setAllDay] = useState(false);
  const [availability, setAvailability] = useState<"busy" | "free">("busy");
  const [loading, setLoading] = useState(editing);
  const [mutationAllowed, setMutationAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(editing);
    Promise.all([
      api.get<CalendarSummary[]>("/api/sources"),
      editing && params.eventId
        ? api.get<KeeperEvent>(`/api/v1/events/${params.eventId}`)
        : Promise.resolve(null),
    ])
      .then(([items, event]) => {
        if (!live) return;
        const writable = items.filter((calendar) =>
          calendar.capabilities.includes("push"),
        );
        setCalendars(writable);
        setCalendarId(event?.calendarId ?? writable[0]?.id ?? "");
        if (event) {
          if (!canMutateEvent(event)) {
            setMutationAllowed(false);
            return;
          }
          setTitle(event.title ?? "");
          setDescription(event.description ?? "");
          setLocation(event.location ?? "");
          setStartTime(
            event.isAllDay
              ? parseAllDayDate(event.startTime, defaultStart)
              : parseEventDate(event.startTime, defaultStart),
          );
          setEndTime(
            event.isAllDay
              ? parseAllDayDate(event.endTime, defaultEnd)
              : parseEventDate(event.endTime, defaultEnd),
          );
          setAllDay(event.isAllDay);
          setAvailability(event.availability);
        }
      })
      .catch((reason: unknown) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load the event form.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, editing, params.eventId]);

  const toggleAllDay = (next: boolean) => {
    setAllDay(next);
    if (next) {
      const range = normalizeAllDayRange(startTime, endTime);
      setStartTime(range.start);
      setEndTime(range.end);
    }
  };
  const submit = async () => {
    const dateError = validateEventDateRange(startTime, endTime);
    if (dateError) {
      setError(dateError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dates = buildEventDatePayload(startTime, endTime, isAllDay);
      const eventPayload = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        ...dates,
        isAllDay,
        availability,
      };
      if (editing && params.eventId) {
        await api.client.updateV1Event(params.eventId, eventPayload);
        logProductEvent("event.updated", { allDay: isAllDay, availability });
      } else {
        await api.client.createV1Event({ ...eventPayload, calendarId });
        logProductEvent("event.created", { allDay: isAllDay, availability });
      }
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save event. Your edits are still here so you can retry.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading event…" />;
  if (!mutationAllowed)
    return (
      <ErrorState message="Only events created directly in Keeper can be edited. Manage this event in its source calendar." />
    );
  const dateError = validateEventDateRange(startTime, endTime);
  return (
    <Screen>
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
      />
      <Field
        label="Location"
        value={location}
        onChangeText={setLocation}
        autoCapitalize="sentences"
      />
      <NativeDateTimeField
        label="Starts"
        value={startTime}
        onValueChange={setStartTime}
        allDay={isAllDay}
      />
      <NativeDateTimeField
        label="Ends"
        value={endTime}
        onValueChange={setEndTime}
        allDay={isAllDay}
        minimumDate={startTime}
      />
      {dateError ? (
        <Text selectable style={{ color: colors.danger }}>
          {dateError}
        </Text>
      ) : null}
      <Section title="Calendar">
        {calendars.length ? (
          calendars
            .filter((calendar) => !editing || calendar.id === calendarId)
            .map((calendar) => (
              <Row
                key={calendar.id}
                label={calendar.name}
                detail={
                  editing
                    ? `${calendar.accountLabel} · Events cannot move between calendars`
                    : calendar.accountLabel
                }
                disabled={editing}
                selected={calendar.id === calendarId}
                selectionRole="radio"
                onPress={() => setCalendarId(calendar.id)}
                trailing={
                  <Text style={{ color: colors.accent }}>
                    {calendar.id === calendarId ? "✓" : ""}
                  </Text>
                }
              />
            ))
        ) : (
          <Row
            label="No writable calendars"
            detail="Connect a push-capable calendar before creating an event."
          />
        )}
      </Section>
      <Section title="Options">
        <ToggleRow
          label="All-Day Event"
          value={isAllDay}
          onValueChange={toggleAllDay}
        />
        <ToggleRow
          label="Show as Free"
          value={availability === "free"}
          onValueChange={(value) => setAvailability(value ? "free" : "busy")}
        />
      </Section>
      <Field
        label="Notes"
        value={description}
        onChangeText={setDescription}
        multiline
        autoCapitalize="sentences"
      />
      {error ? (
        <Text selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        busy={busy}
        disabled={!title.trim() || !calendarId || Boolean(dateError)}
        label={editing ? "Save Changes" : "Create Event"}
        onPress={submit}
      />
    </Screen>
  );
}
