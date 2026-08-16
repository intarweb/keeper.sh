interface PropertyLine {
  readonly name: string;
  readonly params: string;
  readonly value: string;
}

const valueSeparatorIndex = (line: string): number => {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === ":" && !quoted) {
      return index;
    }
  }
  return -1;
};

const parsePropertyLine = (line: string): PropertyLine | null => {
  const separator = valueSeparatorIndex(line);
  if (separator === -1) {
    return null;
  }
  const head = line.slice(0, separator);
  const parameterStart = head.indexOf(";");
  if (parameterStart === -1) {
    return { name: head.toUpperCase(), params: "", value: line.slice(separator + 1) };
  }
  return {
    name: head.slice(0, parameterStart).toUpperCase(),
    params: head.slice(parameterStart),
    value: line.slice(separator + 1),
  };
};

const formatPropertyLine = (line: PropertyLine): string => `${line.name}${line.params}:${line.value}`;

const parameterValue = (params: string, name: string): string | null => {
  const pattern = new RegExp(`;${name}=("[^"]*"|[^;:]*)`, "iu");
  const matched = pattern.exec(params);
  if (!matched) {
    return null;
  }
  const [, value] = matched;
  if (typeof value !== "string") {
    return null;
  }
  return value.replaceAll('"', "");
};

export { formatPropertyLine, parameterValue, parsePropertyLine };
export type { PropertyLine };
