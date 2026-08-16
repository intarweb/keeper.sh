import type { RemoteEvent } from "@keeper.sh/sync-protocol";
import type { Mapping } from "../state/mappings";
import type { Conflict } from "./plan";

const classifyConflict = (
  mapping: Mapping,
  observedSource: RemoteEvent | null,
  observedMirror: RemoteEvent | null,
): Conflict | null => {
  throw new Error(
    `unimplemented: classifyConflict(${mapping.destination.id.value}, ${observedSource?.id.value ?? "none"}, ${observedMirror?.id.value ?? "none"})`,
  );
};

export { classifyConflict };
