import type { calendar_v3 } from "@googleapis/calendar";
import type { InstallationId, Provenance } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

const provenancePropertyKey = "keeper.sh/installation";

interface ProvenanceInputs {
  readonly installation: InstallationId;
  readonly deterministicIds: ReadonlySet<string>;
}

const decodeProvenance = (
  item: calendar_v3.Schema$Event,
  inputs: ProvenanceInputs,
): Provenance => unimplemented(item, inputs);

export { decodeProvenance, provenancePropertyKey };
export type { ProvenanceInputs };
