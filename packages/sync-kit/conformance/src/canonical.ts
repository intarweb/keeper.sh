type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

const canonicalise = (value: CanonicalValue): string => {
  throw new Error(`unimplemented: canonicalise(${typeof value})`);
};

const sortedKeys = (keys: readonly string[]): readonly string[] => {
  throw new Error(`unimplemented: sortedKeys(${keys.length})`);
};

export { canonicalise, sortedKeys };
export type { CanonicalValue };
