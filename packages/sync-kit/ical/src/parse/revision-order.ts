import type { ParsedVevent } from "./parse-vevent";

const compareEventRevisions = (_left: ParsedVevent, _right: ParsedVevent): number => {
  throw new Error("unimplemented");
};

export { compareEventRevisions };
