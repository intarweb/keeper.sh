import type { EventAvailability, RemoteEvent } from "../types";

/*
 * What a destination reported holding for one mirror, in the three dimensions
 * reconciliation compares. A dimension the destination did not report is null, which
 * means "unknown" and never "differs": the comparison falls back to the local event for
 * that dimension rather than inventing a divergence.
 */
interface RemoteStateObservation {
  availability: EventAvailability | null;
  contentHash: string;
  endTime: Date | null;
  startTime: Date | null;
}

/*
 * A destination's account of one mirror where every dimension is known, which is what a
 * provider reads out of a resource it just wrote or just listed.
 */
interface StoredRemoteState {
  availability: EventAvailability;
  contentHash: string;
  endTime: Date;
  startTime: Date;
}

interface RemoteStateEcho {
  availability: EventAvailability | null;
  contentHash: string;
  endSecond: number | null;
  startSecond: number | null;
}

const REMOTE_ECHO_FIELD_SEPARATOR = "|";

const REMOTE_ECHO_RECORD_SEPARATOR = "\n";

/*
 * How many read-backs a mapping remembers alongside the one its push was echoed with. A
 * destination served by replicas that normalize differently renders one stored mirror
 * more than one way, so remembering a single rejected rendering only halves the churn:
 * the next run meets the other rendering, replaces, and forgets the first again.
 */
const MAX_REMEMBERED_REJECTED_ECHOES = 3;

const AVAILABILITIES: EventAvailability[] = ["busy", "free", "oof", "workingElsewhere"];

/*
 * A time the provider handed us but could not parse is unknown, not zero: serializing an
 * Invalid Date would write a row no run can read back.
 */
const toSecond = (value: Date | null): number | null => {
  if (value === null || !Number.isFinite(value.getTime())) {
    return null;
  }
  return Math.trunc(value.getTime() / 1000);
};

/*
 * A content-only echo serializes to the bare hash, which is what rows written before the
 * time and availability dimensions existed already hold.
 */
const serializeRemoteStateEcho = (observation: RemoteStateObservation): string => {
  const startSecond = toSecond(observation.startTime);
  const endSecond = toSecond(observation.endTime);
  if (startSecond === null && endSecond === null && observation.availability === null) {
    return observation.contentHash;
  }
  return [
    observation.contentHash,
    startSecond ?? "",
    endSecond ?? "",
    observation.availability ?? "",
  ].join(REMOTE_ECHO_FIELD_SEPARATOR);
};

const parseSecond = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  return Number(value);
};

const isReadableSecond = (value: string | undefined): boolean =>
  !value || Number.isSafeInteger(Number(value));

const parseAvailability = (value: string | undefined): EventAvailability | null =>
  AVAILABILITIES.find((candidate) => candidate === value) ?? null;

const isReadableAvailability = (value: string | undefined): boolean =>
  !value || parseAvailability(value) !== null;

/*
 * An echo whose shape does not read is treated as absent rather than fatal. Reconciliation
 * walks every mapping on the calendar in one loop, so throwing here would stop the whole
 * destination reconciling on this run and on every run after it, while an absent echo
 * degrades exactly one mapping to the source comparison: one correction, not a bricked
 * calendar. `echo.unreadable_count` on the wide event is how it stays visible.
 */
const parseRemoteStateEcho = (value: string | null): RemoteStateEcho | null => {
  if (value === null) {
    return null;
  }
  const [contentHash, startSecond, endSecond, availability] = value.split(
    REMOTE_ECHO_FIELD_SEPARATOR,
  );
  if (!contentHash) {
    return null;
  }
  if (
    !isReadableSecond(startSecond)
    || !isReadableSecond(endSecond)
    || !isReadableAvailability(availability)
  ) {
    return null;
  }
  return {
    availability: parseAvailability(availability),
    contentHash,
    endSecond: parseSecond(endSecond),
    startSecond: parseSecond(startSecond),
  };
};

const splitRemoteStateEchoes = (value: string | null): string[] => {
  if (value === null) {
    return [];
  }
  return value.split(REMOTE_ECHO_RECORD_SEPARATOR).filter((echo) => echo.length > 0);
};

/*
 * The renderings a mapping has seen the destination hold for the content it currently
 * carries, newest first. A push of different content replaces the mapping row, so the set
 * never outlives what it describes.
 */
const rememberRejectedEcho = (recorded: string | null, rejected: string): string =>
  [rejected, ...splitRemoteStateEchoes(recorded).filter((echo) => echo !== rejected)]
    .slice(0, MAX_REMEMBERED_REJECTED_ECHOES)
    .join(REMOTE_ECHO_RECORD_SEPARATOR);

const readRemoteStateObservation = (
  remoteEvent: RemoteEvent,
): RemoteStateObservation | null => {
  if (typeof remoteEvent.editableContentHash !== "string") {
    return null;
  }
  return {
    availability: remoteEvent.editableAvailability ?? null,
    contentHash: remoteEvent.editableContentHash,
    endTime: remoteEvent.endTime,
    startTime: remoteEvent.startTime,
  };
};

const echoAccountsForContent = (
  echo: RemoteStateEcho | null,
  observation: RemoteStateObservation,
): boolean => echo !== null && echo.contentHash === observation.contentHash;

const echoAccountsForTime = (
  echo: RemoteStateEcho | null,
  observation: RemoteStateObservation,
): boolean => echo !== null
  && echo.startSecond !== null
  && echo.endSecond !== null
  && echo.startSecond === toSecond(observation.startTime)
  && echo.endSecond === toSecond(observation.endTime);

const echoAccountsForAvailability = (
  echo: RemoteStateEcho | null,
  observation: RemoteStateObservation,
): boolean => echo !== null
  && echo.availability !== null
  && echo.availability === observation.availability;

export {
  echoAccountsForAvailability,
  echoAccountsForContent,
  echoAccountsForTime,
  MAX_REMEMBERED_REJECTED_ECHOES,
  parseRemoteStateEcho,
  readRemoteStateObservation,
  rememberRejectedEcho,
  serializeRemoteStateEcho,
  splitRemoteStateEchoes,
};
export type { RemoteStateEcho, RemoteStateObservation, StoredRemoteState };
