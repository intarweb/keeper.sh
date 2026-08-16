const partOrder = [
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "WKST",
  "BYSECOND",
  "BYMINUTE",
  "BYHOUR",
  "BYDAY",
  "BYMONTHDAY",
  "BYYEARDAY",
  "BYWEEKNO",
  "BYMONTH",
  "BYSETPOS",
] as const;

const localUntil = /^\d{8}T\d{6}$/u;

const orderedNames: readonly string[] = partOrder;

const rankOf = (name: string): number => {
  const index = orderedNames.indexOf(name);
  if (index === -1) {
    return partOrder.length;
  }
  return index;
};

const canonicalUntil = (value: string): string => {
  if (localUntil.test(value)) {
    return `${value}Z`;
  }
  return value;
};

interface RulePart {
  readonly name: string;
  readonly value: string;
}

const parsedParts = (rule: string): readonly RulePart[] =>
  rule
    .split(";")
    .filter((part) => part.includes("="))
    .map((part) => {
      const separator = part.indexOf("=");
      const name = part.slice(0, separator).trim().toUpperCase();
      const value = part.slice(separator + 1).trim().toUpperCase();
      if (name === "UNTIL") {
        return { name, value: canonicalUntil(value) };
      }
      return { name, value };
    });

const orderedParts = (parts: readonly RulePart[]): readonly RulePart[] =>
  [...parts].toSorted((left, right) => {
    const byRank = rankOf(left.name) - rankOf(right.name);
    if (byRank !== 0) {
      return byRank;
    }
    return left.name.localeCompare(right.name);
  });

const canonicalizeRecurrenceRule = (rule: string): string =>
  orderedParts(parsedParts(rule))
    .map((part) => `${part.name}=${part.value}`)
    .join(";");

export { canonicalizeRecurrenceRule };
