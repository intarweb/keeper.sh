import type { Result, WriteIntent, WriteOutcome } from "@keeper.sh/sync-protocol";
import type { WriteLogEntry } from "../options";
import { violated } from "../violation";

const overwritingKinds = new Set(["created", "updated", "deleted"]);

const assertConflictNotOverwrite = (result: Result<WriteOutcome>): void => {
  if (!result.ok) {
    if (result.failure.kind === "conflict" || result.failure.kind === "unrepresentable") {
      return;
    }
    throw violated(
      "CONF-O15",
      `a conflicting write failed as "${result.failure.kind}" instead of a typed conflict`,
    );
  }
  if (overwritingKinds.has(result.value.kind)) {
    throw violated(
      "CONF-O15",
      `a conflicting write answered "${result.value.kind}", which overwrote the differing remote copy`,
    );
  }
};

const isRemoval = (intent: WriteIntent): boolean =>
  intent.kind === "delete" || intent.kind === "retire";

const assertNoDeleteThenCreate = (writeLog: readonly WriteLogEntry[]): void => {
  let removals = 0;
  for (const entry of writeLog) {
    if (isRemoval(entry.intent)) {
      removals += 1;
      continue;
    }
    if (entry.intent.kind === "create" && removals > 0) {
      throw violated(
        "CONF-O25",
        "the write log carries a delete followed by a create, which is a blind recreation",
      );
    }
  }
};

const assertNoUnconditionalWrite = (writeLog: readonly WriteLogEntry[]): void => {
  for (const entry of writeLog) {
    if (entry.intent.kind === "create" && entry.intent.idempotencyKey.value.length === 0) {
      throw violated("CONF-O36", "a create was issued without an idempotency key");
    }
    if (entry.intent.kind === "create") {
      continue;
    }
    if (entry.intent.precondition.kind === "matchesVersion") {
      if (entry.intent.precondition.version.value.length === 0) {
        throw violated("CONF-O36", "a conditional write carried an empty version precondition");
      }
      continue;
    }
    if (entry.intent.precondition.fingerprint.value.length === 0) {
      throw violated("CONF-O36", "a conditional write carried an empty fingerprint precondition");
    }
  }
};

export { assertConflictNotOverwrite, assertNoDeleteThenCreate, assertNoUnconditionalWrite };
