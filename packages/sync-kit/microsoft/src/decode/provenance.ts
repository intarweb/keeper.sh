import type { InstallationId, Provenance } from "@keeper.sh/sync-protocol";
import type { Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { unimplemented } from "../unimplemented";

const provenancePropertyName = "String {keeper-sh-0000-0000-000000000001} Name installation";
const provenanceCategory = "Keeper.sh";

const readProvenance = (event: GraphEvent, installation: InstallationId): Provenance =>
  unimplemented(event, installation);

export { provenanceCategory, provenancePropertyName, readProvenance };
