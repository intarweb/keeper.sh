import { unimplemented } from "../unimplemented";

interface CursorFrontier {
  readonly latest: (scopeFingerprint: string) => string | null;
  readonly advance: (scopeFingerprint: string, providerLink: string) => void;
  readonly isSuperseded: (scopeFingerprint: string, providerLink: string) => boolean;
}

const createCursorFrontier = (): CursorFrontier => unimplemented();

export { createCursorFrontier };
export type { CursorFrontier };
