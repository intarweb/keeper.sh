import type { EventTime } from "@keeper.sh/sync-protocol";
import type { IcsOptions } from "../options";
import type { VeventComponent } from "./parse-calendar";

type EndTimeResolution =
  | { readonly kind: "resolved"; readonly time: EventTime }
  | { readonly kind: "unbuildable" };

const resolveEndTime = (_component: VeventComponent, _options: IcsOptions): EndTimeResolution => {
  throw new Error("unimplemented");
};

export { resolveEndTime };
export type { EndTimeResolution };
