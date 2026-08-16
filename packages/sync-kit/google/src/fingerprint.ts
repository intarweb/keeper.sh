import type { EditableContent, Fingerprint, FingerprintContract } from "@keeper.sh/sync-protocol";
import { unimplemented } from "./unimplemented";

const googleFingerprintContract: FingerprintContract = {
  canonicalisation: "rfc8785",
  comparableFields: [
    "title",
    "description",
    "location",
    "availability",
    "visibility",
    "recurrence",
    "time",
    "anchor",
  ],
};

const canonicalEncoding = (content: EditableContent): string => unimplemented(content);

const fingerprintContent = (
  content: EditableContent,
  hash: (input: string) => string,
): Fingerprint => unimplemented(content, hash);

export { canonicalEncoding, fingerprintContent, googleFingerprintContract };
