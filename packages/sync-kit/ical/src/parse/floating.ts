import type { Instant } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { IcsDocument, VeventComponent } from "./parse-calendar";

const floatingAnchorSources = ["eventTzid", "calendarTimezone"] as const;
type FloatingAnchorSource = (typeof floatingAnchorSources)[number];

type FloatingAnchor =
  | { readonly kind: "anchored"; readonly instant: Instant; readonly via: FloatingAnchorSource }
  | { readonly kind: "unsupported" };

const anchorFloatingValue = (
  _value: string,
  _component: VeventComponent,
  _document: IcsDocument,
  _options: IcsOptions): FloatingAnchor => {
  throw new Error("unimplemented");
};

export { anchorFloatingValue, floatingAnchorSources };
export type { FloatingAnchor, FloatingAnchorSource };
