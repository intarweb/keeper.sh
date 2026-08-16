import type { InstallationId } from "@keeper.sh/sync-protocol";
import type { VeventComponent } from "./parse-calendar";

const isSelfAuthored = (_component: VeventComponent, _installation: InstallationId): boolean => {
  throw new Error("unimplemented");
};

export { isSelfAuthored };
