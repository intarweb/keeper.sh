import { unimplemented } from "../unimplemented";

const verifyClientState = (presented: string, storedHash: string): boolean =>
  unimplemented(presented, storedHash);

const clientStateHash = (secret: string, hash: (input: string) => string): string =>
  unimplemented(secret, hash);

export { clientStateHash, verifyClientState };
