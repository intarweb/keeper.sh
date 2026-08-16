import type { ZoneId } from "@keeper.sh/sync-protocol";
import type { DeclaredZone } from "./vtimezone";

const isIanaAuthoritative = (_declared: DeclaredZone | null, _zone: ZoneId): boolean => {
  throw new Error("unimplemented");
};

export { isIanaAuthoritative };
