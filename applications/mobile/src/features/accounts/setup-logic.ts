import type { CalendarSummary } from "@/api/domain";

export type SetupStep = "select" | "rename" | "destinations" | "sources";

export interface SetupWorkflow {
  destinationCalendars: CalendarSummary[];
  sourceCalendars: CalendarSummary[];
  steps: SetupStep[];
}

export interface MappingLimit {
  current: number;
  limit: number | null;
}

export function buildSetupWorkflow(selected: CalendarSummary[]): SetupWorkflow {
  const destinationCalendars = selected.filter((calendar) =>
    calendar.capabilities.includes("pull"),
  );
  const sourceCalendars = selected.filter((calendar) =>
    calendar.capabilities.includes("push"),
  );
  return {
    destinationCalendars,
    sourceCalendars,
    steps: [
      "select",
      "rename",
      ...(destinationCalendars.length ? ["destinations" as const] : []),
      ...(sourceCalendars.length ? ["sources" as const] : []),
    ],
  };
}

export function nextSetupStep(
  workflow: SetupWorkflow,
  current: SetupStep,
): SetupStep | "finish" {
  const index = workflow.steps.indexOf(current);
  return index < 0 || index === workflow.steps.length - 1
    ? "finish"
    : (workflow.steps[index + 1] ?? "finish");
}

export function nextCalendarIndex(
  current: number,
  calendars: readonly CalendarSummary[],
): number | "next-step" {
  return current + 1 < calendars.length ? current + 1 : "next-step";
}

export function effectiveMappingCount(
  limit: MappingLimit,
  initialIds: readonly string[],
  selectedIds: readonly string[],
): number {
  return Math.max(0, limit.current - initialIds.length + selectedIds.length);
}

export function canAddMapping(
  limit: MappingLimit,
  initialIds: readonly string[],
  selectedIds: readonly string[],
): boolean {
  return (
    limit.limit === null ||
    effectiveMappingCount(limit, initialIds, selectedIds) < limit.limit
  );
}

export function toggleMappingSelection(options: {
  candidateId: string;
  initialIds: readonly string[];
  limit: MappingLimit;
  selectedIds: readonly string[];
}): { blocked: boolean; selectedIds: string[] } {
  const { candidateId, initialIds, limit, selectedIds } = options;
  if (selectedIds.includes(candidateId)) {
    return {
      blocked: false,
      selectedIds: selectedIds.filter((id) => id !== candidateId),
    };
  }
  if (!canAddMapping(limit, initialIds, selectedIds))
    return { blocked: true, selectedIds: [...selectedIds] };
  return { blocked: false, selectedIds: [...selectedIds, candidateId] };
}
