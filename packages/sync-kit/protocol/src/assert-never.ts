const assertNever = (value: never): never => {
  throw new Error(`unimplemented: ${typeof value}`);
};

export { assertNever };
