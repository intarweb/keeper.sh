const unimplemented = (...pending: readonly unknown[]): never => {
  throw new Error("unimplemented", { cause: pending });
};

export { unimplemented };
