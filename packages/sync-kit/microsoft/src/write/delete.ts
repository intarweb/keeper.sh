import type {
  OperationContext,
  RemoteVersion,
  Result,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { graphEmpty } from "../client/graph-call";
import { readIdentity } from "../decode/identity";
import { enforcedPrecondition } from "./precondition";
import { eventPathOf, mailboxesOf, readRemoteEvent, remoteRefOf, writeFailure } from "./remote";
import type { WriteSurroundings } from "./surroundings";

type Removing = Extract<WriteIntent<"microsoft">, { kind: "delete" } | { kind: "retire" }>;

const unobservedVersion: Result<WriteOutcome> = {
  ok: false,
  failure: { kind: "transport", status: null, disposition: "permanent" },
};

const versionOfEvent = (event: GraphEvent): RemoteVersion | null => {
  const reading = readIdentity(event);
  if (reading.kind !== "identified") {
    return null;
  }
  return reading.identity.version;
};

const spentPrecondition = async (
  intent: Removing,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => {
  const remote = remoteRefOf(intent.target.value);
  const fetched = await readRemoteEvent(
    intent.calendar,
    { kind: "remoteEventId", value: intent.target.value },
    context,
    surroundings,
  );
  switch (fetched.kind) {
    case "found": {
      const version = versionOfEvent(fetched.event);
      if (version === null) {
        return unobservedVersion;
      }
      return {
        ok: true,
        value: { kind: "conflict", remote, observed: { kind: "matchesVersion", version } },
      };
    }
    case "absent": {
      return { ok: true, value: { kind: "alreadyAbsent", remote } };
    }
    case "notAttempted": {
      return { ok: true, value: { kind: "notAttempted", reason: fetched.reason } };
    }
    case "failed": {
      return { ok: false, failure: writeFailure(fetched.failure, intent.calendar) };
    }
    default: {
      return assertNever(fetched);
    }
  }
};

const removedInGraph = async (
  intent: Removing,
  ifMatch: string,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => {
  const remote = remoteRefOf(intent.target.value);
  const answered = await surroundings.requests.send<null>({
    operation: "write",
    mailboxes: mailboxesOf(intent.calendar),
    context,
    send: (signal) =>
      graphEmpty(
        surroundings.dependencies.graph,
        {
          method: "delete",
          path: eventPathOf(intent.calendar, intent.target.value),
          headers: { "If-Match": ifMatch },
        },
        signal,
      ),
  });
  switch (answered.kind) {
    case "answered": {
      return { ok: true, value: { kind: "deleted", remote } };
    }
    case "notAttempted": {
      return { ok: true, value: { kind: "notAttempted", reason: answered.reason } };
    }
    case "failed": {
      if (answered.failure.kind === "notFound" || answered.failure.kind === "gone") {
        return { ok: true, value: { kind: "alreadyAbsent", remote } };
      }
      if (answered.failure.kind === "conflict") {
        return spentPrecondition(intent, context, surroundings);
      }
      return { ok: false, failure: writeFailure(answered.failure, intent.calendar) };
    }
    default: {
      return assertNever(answered);
    }
  }
};

const deleteInGraph = (
  intent: Removing,
  context: OperationContext,
  surroundings: WriteSurroundings,
): Promise<Result<WriteOutcome>> => {
  const precondition = enforcedPrecondition(intent.precondition);
  if (precondition.kind !== "enforced") {
    return Promise.resolve({ ok: false, failure: { kind: "unsupported", operation: "write" } });
  }
  return removedInGraph(intent, precondition.ifMatch, context, surroundings);
};

export { deleteInGraph };
export type { Removing };
