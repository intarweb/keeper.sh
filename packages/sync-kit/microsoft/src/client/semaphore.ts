import { unimplemented } from "../unimplemented";

class PermitAborted extends Error {
  constructor() {
    super("the caller was aborted while it waited for a mailbox permit");
    this.name = "PermitAborted";
  }
}

interface MailboxSemaphore {
  readonly withPermits: <Value>(
    keys: readonly string[],
    signal: AbortSignal,
    body: () => Promise<Value>,
  ) => Promise<Value>;
  readonly held: (key: string) => number;
  readonly available: (key: string) => number;
  readonly waiting: (key: string) => number;
  readonly peak: (key: string) => number;
}

const createMailboxSemaphore = (permitsPerMailbox: number): MailboxSemaphore =>
  unimplemented(permitsPerMailbox);

export { createMailboxSemaphore, PermitAborted };
export type { MailboxSemaphore };
