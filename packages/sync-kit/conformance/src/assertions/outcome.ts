import type { Result, WriteOutcome } from "@keeper.sh/sync-protocol";
import type { WriteLogEntry } from "../options";

const assertConflictNotOverwrite = (result: Result<WriteOutcome>): void => {
  throw new Error(`unimplemented: assertConflictNotOverwrite(${result.ok})`);
};

const assertNoDeleteThenCreate = (writeLog: readonly WriteLogEntry[]): void => {
  throw new Error(`unimplemented: assertNoDeleteThenCreate(${writeLog.length})`);
};

const assertNoUnconditionalWrite = (writeLog: readonly WriteLogEntry[]): void => {
  throw new Error(`unimplemented: assertNoUnconditionalWrite(${writeLog.length})`);
};

export { assertConflictNotOverwrite, assertNoDeleteThenCreate, assertNoUnconditionalWrite };
