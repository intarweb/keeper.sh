import type { IcsOptions } from "../options";
import type { UnreadableReason } from "../text/patch";
import type { PropertyLine } from "../text/property-line";
import type { DeclaredZone } from "../zone/vtimezone";

interface VeventComponent {
  readonly instance: number;
  readonly properties: readonly PropertyLine[];
}

type IcsDocument =
  | {
      readonly kind: "readable";
      readonly calendarZone: string | null;
      readonly declaredZones: readonly DeclaredZone[];
      readonly components: readonly VeventComponent[];
    }
  | { readonly kind: "unreadable"; readonly reason: UnreadableReason };

const parseIcsDocument = (_body: string, _options: IcsOptions): IcsDocument => {
  throw new Error("unimplemented");
};

export { parseIcsDocument };
export type { IcsDocument, VeventComponent };
