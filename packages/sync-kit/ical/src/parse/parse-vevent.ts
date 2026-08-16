import type { EditableContent, Instant, WithheldIdentity, WithholdReason } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { EventIdentity } from "./identity";
import type { IcsDocument, VeventComponent } from "./parse-calendar";

interface EventRevision {
  readonly sequence: number | null;
  readonly lastModified: Instant | null;
  readonly stamp: Instant | null;
  readonly created: Instant | null;
}

interface ParsedVevent {
  readonly identity: EventIdentity;
  readonly content: EditableContent;
  readonly revision: EventRevision;
  readonly cancelled: boolean;
}

type VeventOutcome =
  | { readonly kind: "parsed"; readonly event: ParsedVevent }
  | { readonly kind: "withheld"; readonly identity: WithheldIdentity; readonly reason: WithholdReason }
  | { readonly kind: "selfAuthored"; readonly identity: EventIdentity };

const parseVevent = (
  _component: VeventComponent,
  _document: IcsDocument,
  _options: IcsOptions): VeventOutcome => {
  throw new Error("unimplemented");
};

export { parseVevent };
export type { EventRevision, ParsedVevent, VeventOutcome };
