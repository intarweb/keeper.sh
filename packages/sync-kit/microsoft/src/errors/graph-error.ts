import { unimplemented } from "../unimplemented";

interface DecodedGraphError {
  readonly status: number | null;
  readonly code: string | null;
  readonly retryAfter: string | null;
}

const decodeGraphError = (error: unknown): DecodedGraphError => unimplemented(error);

export { decodeGraphError };
export type { DecodedGraphError };
