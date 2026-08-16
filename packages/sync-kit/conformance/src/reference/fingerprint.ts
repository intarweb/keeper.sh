import type { EditableContent, Fingerprint, FingerprintContract } from "@keeper.sh/sync-protocol";

const referenceFingerprintContract: FingerprintContract = {
  canonicalisation: "rfc8785",
  comparableFields: ["title", "description", "location", "availability", "visibility"],
};

const fingerprintOf = (
  content: EditableContent,
  hash: (input: string) => string,
): Fingerprint => {
  throw new Error(`unimplemented: fingerprintOf(${content.title.length}, ${typeof hash})`);
};

export { fingerprintOf, referenceFingerprintContract };
