const WRITE_BACK_MODES = ["edits", "edits_and_deletes", "off"] as const;

type WriteBackMode = typeof WRITE_BACK_MODES[number];

type WriteBackState = "delete_confirmation_required" | "ok" | "quarantined";

type WriteBackField =
  | "description"
  | "endTime"
  | "isAllDay"
  | "location"
  | "startTime"
  | "startTimeZone"
  | "summary";

interface WriteBackPolicy {
  /*
   * A human has looked at copies that vanished in bulk and said to go ahead. It exempts
   * those deletions from the bulk breaker and from nothing else: each one is still
   * confirmed against the copy itself, still capped per day, still tombstoned first.
   */
  deleteApproved: boolean;
  destinationCalendarId: string;
  excludeEventDescription: boolean;
  excludeEventLocation: boolean;
  excludeEventName: boolean;
  /*
   * A pair waiting on a human answer about copies that vanished keeps its mode, so the
   * classifier still recognises the mappings the question is about. It acts on none of
   * them and holds their pending state, rather than letting the copies be re-created out
   * from under the question it just asked.
   */
  paused: boolean;
  sourceCalendarId: string;
  writeBackMode: WriteBackMode;
}

const NO_WRITE_BACKS = 0;

/*
 * A recorded observation belongs to the policy it was taken under, and so do the budgets
 * spent under it. Dropping the observation without returning the budgets would leave a
 * once-runaway mapping permanently refused after a human clears the quarantine.
 */
const WRITE_BACK_WITNESS_RESET = {
  destinationAvailability: null,
  destinationContentHash: null,
  destinationDescription: null,
  destinationEndTime: null,
  destinationIsAllDay: null,
  destinationLocation: null,
  destinationStartTime: null,
  destinationSummary: null,
  writeBackDailyCount: NO_WRITE_BACKS,
  writeBackDailyWindowStart: null,
  writeBackEpoch: NO_WRITE_BACKS,
  writeBackEpochWindowStart: null,
} as const;

interface WriteBackUpdates {
  description?: string;
  endTime?: Date;
  isAllDay?: boolean;
  location?: string;
  startTime?: Date;
  startTimeZone?: string;
  summary?: string;
}

const PROJECTION_IDENTITY_FIELDS: WriteBackField[] = [
  "endTime",
  "isAllDay",
  "startTime",
  "startTimeZone",
];

const isWriteBackMode = (value: string): value is WriteBackMode =>
  WRITE_BACK_MODES.includes(value as WriteBackMode);

const DELETE_CONFIRMATION_STATE = "delete_confirmation_required";

/*
 * A quarantined pair reverts to one-way outright. A pair waiting on a human answer about
 * copies that vanished keeps its mode and pauses instead: dropping it would let the very
 * copies the question is about be re-created on the next pass, destroying the pending
 * state the answer is supposed to resolve.
 */
const resolveWriteBackPolicyState = (
  writeBackMode: WriteBackMode,
  writeBackState: string,
  deleteApproval?: { approvedAt: Date | null; now: Date; ttlMs: number },
): { deleteApproved: boolean; paused: boolean; writeBackMode: WriteBackMode } => {
  const deleteApproved = deleteApproval?.approvedAt instanceof Date
    && deleteApproval.now.getTime() - deleteApproval.approvedAt.getTime()
      < deleteApproval.ttlMs;

  if (writeBackState === DELETE_CONFIRMATION_STATE) {
    return { deleteApproved: false, paused: true, writeBackMode };
  }
  if (writeBackState !== "ok") {
    return { deleteApproved: false, paused: false, writeBackMode: "off" };
  }
  return { deleteApproved, paused: false, writeBackMode };
};

const resolveWriteBackEligibleFields = (
  policy?: WriteBackPolicy,
): Set<WriteBackField> => {
  if (!policy) {
    throw new Error("Write-back eligibility requires a source calendar policy");
  }

  const fields = new Set<WriteBackField>(PROJECTION_IDENTITY_FIELDS);
  if (!policy.excludeEventName) {
    fields.add("summary");
  }
  if (!policy.excludeEventDescription) {
    fields.add("description");
  }
  if (!policy.excludeEventLocation) {
    fields.add("location");
  }
  return fields;
};

const SCHEDULE_FIELDS: WriteBackField[] = ["endTime", "isAllDay", "startTime"];

const assertWriteBackPayload = (
  updates: WriteBackUpdates,
  eligibleFields: ReadonlySet<WriteBackField>,
): void => {
  for (const field of Object.keys(updates)) {
    if (!eligibleFields.has(field as WriteBackField)) {
      throw new Error(`Write-back payload carries the redacted field ${field}`);
    }
  }

  const present = SCHEDULE_FIELDS.filter((field) => field in updates);
  if (present.length > 0 && present.length !== SCHEDULE_FIELDS.length) {
    throw new Error(
      "Write-back payload carries a partial schedule; start, end and all-day travel together",
    );
  }
};

export {
  assertWriteBackPayload,
  isWriteBackMode,
  resolveWriteBackEligibleFields,
  resolveWriteBackPolicyState,
  WRITE_BACK_MODES,
  WRITE_BACK_WITNESS_RESET,
};
export type {
  WriteBackField,
  WriteBackMode,
  WriteBackPolicy,
  WriteBackState,
  WriteBackUpdates,
};
