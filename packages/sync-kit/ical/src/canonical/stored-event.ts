import type { CanonicalEvent } from "./canonical-event";

const parseStoredCanonicalEvent = (_value: unknown): CanonicalEvent => {
  throw new Error("unimplemented");
};

export { parseStoredCanonicalEvent };
