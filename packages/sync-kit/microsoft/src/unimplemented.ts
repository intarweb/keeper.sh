class Unimplemented extends Error {
  readonly pendingArguments: number;

  constructor(pendingArguments: number) {
    super("unimplemented");
    this.name = "Unimplemented";
    this.pendingArguments = pendingArguments;
  }
}

const unimplemented = (...pending: readonly unknown[]): never => {
  throw new Unimplemented(pending.length);
};

export { unimplemented, Unimplemented };
