import { unimplemented } from "./unimplemented";

type CanonicalRecord = { readonly [key in string]: CanonicalValue };

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | CanonicalRecord;

const compareCodeUnits = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const canonicalise = (value: CanonicalValue): string => unimplemented(value);

export { canonicalise, compareCodeUnits };
export type { CanonicalValue };
