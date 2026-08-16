const assertNever = (value: never): never => {
  throw new Error(`unreachable variant: ${JSON.stringify(value)}`);
};

export { assertNever };
