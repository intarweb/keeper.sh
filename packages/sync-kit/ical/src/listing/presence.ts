import type { EventIdentity } from "../parse/identity";
import type { VeventOutcome } from "../parse/parse-vevent";

const presentIdentities = (_outcomes: readonly VeventOutcome[]): readonly EventIdentity[] => {
  throw new Error("unimplemented");
};

const usableIdentities = (_outcomes: readonly VeventOutcome[]): readonly EventIdentity[] => {
  throw new Error("unimplemented");
};

export { presentIdentities, usableIdentities };
