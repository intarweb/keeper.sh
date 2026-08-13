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

const AVAILABILITIES: EventAvailability[] = ["busy", "free", "oof", "workingElsewhere"];

const toSecond = (value: Date | null): number | null => {
  if (value === null) {
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
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`Recorded destination echo carries an unreadable time: ${value}`);
  }
  return parsed;
};

const parseAvailability = (value: string | undefined): EventAvailability | null => {
  if (!value) {
    return null;
  }
  const availability = AVAILABILITIES.find((candidate) => candidate === value);
  if (!availability) {
    throw new Error(`Recorded destination echo carries an unknown availability: ${value}`);
  }
  return availability;
};

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
  return {
    availability: parseAvailability(availability),
    contentHash,
    endSecond: parseSecond(endSecond),
    startSecond: parseSecond(startSecond),
  };
};

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
  parseRemoteStateEcho,
  readRemoteStateObservation,
  serializeRemoteStateEcho,
};
export type { RemoteStateEcho, RemoteStateObservation, StoredRemoteState };
