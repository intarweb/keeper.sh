interface PropertyLine {
  readonly name: string;
  readonly params: string;
  readonly value: string;
}

const parsePropertyLine = (_line: string): PropertyLine | null => {
  throw new Error("unimplemented");
};

const formatPropertyLine = (_line: PropertyLine): string => {
  throw new Error("unimplemented");
};

export { formatPropertyLine, parsePropertyLine };
export type { PropertyLine };
