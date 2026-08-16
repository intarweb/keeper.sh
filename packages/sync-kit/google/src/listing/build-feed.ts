import type { calendar_v3 } from "@googleapis/calendar";
import type {
  EditableContent,
  InstallationId,
  ListingScope,
  RemoteEvent,
  RemoteEventFacts,
  Removal,
  WithheldEvent,
} from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { contentOfPatch, decodeEvent } from "../decode/decode-event";
import type { DecodedItem, EventPatch } from "../decode/decode-event";
import { decodeEventTime } from "../decode/event-time";
import { decodeProvenance } from "../decode/provenance";
import { fingerprintContent } from "../fingerprint";
import { withinGoogleWindow } from "../window/membership";
import { assembleSeries } from "./assemble-series";
import { collapseRevisions } from "./collapse-revisions";

interface FeedInputs {
  readonly items: readonly calendar_v3.Schema$Event[];
  readonly scope: ListingScope;
  readonly installation: InstallationId;
  readonly hash: (input: string) => string;
}

interface ResolvedFeed {
  readonly events: readonly RemoteEvent[];
  readonly removals: readonly Removal[];
  readonly withheld: readonly WithheldEvent[];
  readonly unnamedDiscards: number;
  readonly selfAuthored: readonly string[];
}

const assembledOverrideIds = (
  items: readonly calendar_v3.Schema$Event[],
): ReadonlySet<string> => {
  const assembly = assembleSeries(items);
  const assembled = new Set<string>();
  for (const series of assembly.series) {
    for (const override of series.overrides) {
      if (typeof override.id === "string") {
        assembled.add(override.id);
      }
    }
  }
  return assembled;
};

const removalOfCancellation = (
  decoded: Extract<DecodedItem, { kind: "cancelled" }>,
): Removal => {
  if (decoded.uid === null) {
    return { kind: "outOfScope", id: decoded.id };
  }
  return { kind: "cancelled", id: decoded.id, uid: decoded.uid };
};

const withheldOf = (
  decoded: Extract<DecodedItem, { kind: "undecodable" }>,
): WithheldEvent | null => {
  if (decoded.uid !== null) {
    return { uid: decoded.uid, id: decoded.id, reason: decoded.reason };
  }
  if (decoded.id === null) {
    return null;
  }
  return { uid: null, id: decoded.id, reason: decoded.reason };
};

const staysInScope = (scope: ListingScope, content: EditableContent): boolean => {
  const { window: bounds } = scope;
  if (content.recurrence !== null) {
    return true;
  }
  return withinGoogleWindow(bounds, content.time);
};

const remoteEventOf = (
  item: calendar_v3.Schema$Event,
  fields: EventPatch,
  content: EditableContent,
  inputs: FeedInputs,
): RemoteEvent => {
  const facts: RemoteEventFacts = {
    id: { kind: "remoteEventId", value: item.id ?? "" },
    deleteHandle: { kind: "deleteHandle", value: item.id ?? "" },
    uid: fields.uid,
    calendar: inputs.scope.calendar,
    revision: fields.revision,
    version: fields.version,
    content,
    fingerprint: fingerprintContent(content, inputs.hash),
  };
  const provenance = decodeProvenance(item, {
    installation: inputs.installation,
    deterministicIds: new Set(),
  });
  switch (provenance.kind) {
    case "ours": {
      return { ...facts, provenance };
    }
    case "foreign": {
      return { ...facts, provenance };
    }
    case "indeterminate": {
      return { ...facts, provenance };
    }
    default: {
      return assertNever(provenance);
    }
  }
};

const resolveFeed = (inputs: FeedInputs): ResolvedFeed => {
  const collapsed = collapseRevisions(inputs.items);
  const assembled = assembledOverrideIds(collapsed.winners);
  const events: RemoteEvent[] = [];
  const removals: Removal[] = [];
  const withheld: WithheldEvent[] = [];
  const selfAuthored: string[] = [];
  let unnamedDiscards = 0;

  for (const item of collapsed.winners) {
    if (typeof item.id === "string" && assembled.has(item.id)) {
      continue;
    }
    const decoded = decodeEvent(item, decodeEventTime);
    switch (decoded.kind) {
      case "cancelled": {
        removals.push(removalOfCancellation(decoded));
        break;
      }
      case "undecodable": {
        const entry = withheldOf(decoded);
        if (entry === null) {
          unnamedDiscards += 1;
          break;
        }
        withheld.push(entry);
        break;
      }
      case "patch": {
        const content = contentOfPatch(decoded.fields);
        if (!staysInScope(inputs.scope, content)) {
          removals.push({ kind: "outOfScope", id: decoded.id });
          break;
        }
        const event = remoteEventOf(item, decoded.fields, content, inputs);
        events.push(event);
        if (event.provenance.kind === "ours") {
          selfAuthored.push(event.uid.value);
        }
        break;
      }
      default: {
        assertNever(decoded);
      }
    }
  }

  return { events, removals, withheld, unnamedDiscards, selfAuthored };
};

export { resolveFeed };
export type { FeedInputs, ResolvedFeed };
