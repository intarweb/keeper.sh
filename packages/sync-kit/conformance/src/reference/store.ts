import type { CalendarKey, RemoteEvent } from "@keeper.sh/sync-protocol";
import type { ProviderSeed, WriteLogEntry } from "../options";

interface ReferenceStore {
  readonly seed: (seed: ProviderSeed) => void;
  readonly objects: () => readonly RemoteEvent[];
  readonly writeLog: () => readonly WriteLogEntry[];
  readonly corruptKnownRows: () => readonly string[];
  readonly calendar: () => CalendarKey;
}

const createReferenceStore = (calendar: CalendarKey): ReferenceStore => {
  throw new Error(`unimplemented: createReferenceStore(${calendar.calendar.value})`);
};

export { createReferenceStore };
export type { ReferenceStore };
