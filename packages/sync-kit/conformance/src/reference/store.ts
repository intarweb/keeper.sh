import type { CalendarKey, EventUid, RemoteEvent, RemoteEventId } from "@keeper.sh/sync-protocol";
import type { ProviderSeed, WriteLogEntry } from "../options";

interface ReportedIdentity {
  readonly uid: EventUid;
  readonly id: RemoteEventId;
}

interface ReferenceStore {
  readonly seed: (seed: ProviderSeed) => void;
  readonly objects: () => readonly RemoteEvent[];
  readonly writeLog: () => readonly WriteLogEntry[];
  readonly corruptKnownRows: () => readonly string[];
  readonly cancelled: () => readonly EventUid[];
  readonly unattributableRemovals: () => readonly RemoteEventId[];
  readonly calendar: () => CalendarKey;
  readonly replaceObjects: (events: readonly RemoteEvent[]) => void;
  readonly record: (entry: WriteLogEntry) => void;
  readonly reported: () => readonly ReportedIdentity[];
  readonly setReported: (identities: readonly ReportedIdentity[]) => void;
  readonly sequenceOf: (uid: string) => number;
  readonly touch: (uid: string) => void;
  readonly currentSequence: () => number;
  readonly clearCorruption: () => void;
}

const signatureOf = (event: RemoteEvent): string =>
  `${event.revision}|${event.version.value}|${event.fingerprint.value}`;

const createReferenceStore = (calendar: CalendarKey): ReferenceStore => {
  let stored: readonly RemoteEvent[] = [];
  let corrupt: readonly string[] = [];
  let cancellations: readonly EventUid[] = [];
  let unattributable: readonly RemoteEventId[] = [];
  let reported: readonly ReportedIdentity[] = [];
  const log: WriteLogEntry[] = [];
  const sequences = new Map<string, number>();
  const signatures = new Map<string, string>();
  let sequence = 0;

  const touch = (uid: string): void => {
    sequence += 1;
    sequences.set(uid, sequence);
  };

  const replaceObjects = (events: readonly RemoteEvent[]): void => {
    for (const event of events) {
      const signature = signatureOf(event);
      if (signatures.get(event.uid.value) !== signature) {
        signatures.set(event.uid.value, signature);
        touch(event.uid.value);
      }
    }
    stored = events;
  };

  return {
    seed: (next: ProviderSeed) => {
      const { cancelled, corruptKnownRows, events, unattributableRemovals } = next;
      corrupt = corruptKnownRows;
      cancellations = cancelled;
      unattributable = unattributableRemovals;
      replaceObjects(events);
    },
    objects: () => stored,
    writeLog: () => log,
    corruptKnownRows: () => corrupt,
    cancelled: () => cancellations,
    unattributableRemovals: () => unattributable,
    calendar: () => calendar,
    replaceObjects,
    record: (entry: WriteLogEntry) => {
      log.push(entry);
    },
    reported: () => reported,
    setReported: (identities: readonly ReportedIdentity[]) => {
      reported = identities;
    },
    sequenceOf: (uid: string) => sequences.get(uid) ?? 0,
    touch,
    currentSequence: () => sequence,
    clearCorruption: () => {
      corrupt = [];
    },
  };
};

export { createReferenceStore };
export type { ReferenceStore, ReportedIdentity };
