import type { InstallationId, RemoteEvent } from "@keeper.sh/sync-protocol";

const provenanceDispositions = ["ourMirror", "foreignInstallation", "external", "indeterminate"] as const;
type ProvenanceDisposition = (typeof provenanceDispositions)[number];

const classifyProvenance = (event: RemoteEvent, installation: InstallationId): ProvenanceDisposition => {
  throw new Error(`unimplemented: classifyProvenance(${event.id.value}, ${installation.value})`);
};

const isRetirable = (event: RemoteEvent, installation: InstallationId): boolean => {
  throw new Error(`unimplemented: isRetirable(${event.id.value}, ${installation.value})`);
};

const isEchoOfOurOwnWrite = (event: RemoteEvent, installation: InstallationId): boolean => {
  throw new Error(`unimplemented: isEchoOfOurOwnWrite(${event.id.value}, ${installation.value})`);
};

export { classifyProvenance, isEchoOfOurOwnWrite, isRetirable, provenanceDispositions };
export type { ProvenanceDisposition };
