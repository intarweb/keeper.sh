import type { EditableContent, Fingerprint, FingerprintContract } from "@keeper.sh/sync-protocol";
import { unimplemented } from "./unimplemented";

const microsoftFingerprintContract: FingerprintContract = {
  canonicalisation: "rfc8785",
  comparableFields: ["title", "description", "location", "availability", "visibility", "time", "recurrence"],
};

const microsoftFingerprint = (
  content: EditableContent,
  hash: (input: string) => string,
): Fingerprint => unimplemented(content, hash);

export { microsoftFingerprint, microsoftFingerprintContract };
