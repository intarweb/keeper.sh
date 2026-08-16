import type { Continuation, ListingScope, SyncCursor } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";
import type { ListingMode } from "./fingerprint";

const cursorVersion = 1;

interface CursorContents {
  readonly version: number;
  readonly mode: ListingMode;
  readonly scopeFingerprint: string;
  readonly providerLink: string;
}

type CursorReading =
  | { readonly kind: "usable"; readonly contents: CursorContents }
  | { readonly kind: "unreadable" };

interface CursorOptions {
  readonly hash: (input: string) => string;
}

const encodeCursorValue = (contents: CursorContents): string => unimplemented(contents);

const decodeCursorValue = (value: string): CursorReading => unimplemented(value);

const mintCursor = (
  scope: ListingScope,
  providerLink: string,
  options: CursorOptions,
): SyncCursor => unimplemented(scope, providerLink, options);

const parseCursor = (
  cursor: SyncCursor,
  scope: ListingScope,
  options: CursorOptions,
): CursorReading => unimplemented(cursor, scope, options);

const mintContinuation = (
  scope: ListingScope,
  providerLink: string,
  options: CursorOptions,
): Continuation => unimplemented(scope, providerLink, options);

const parseContinuation = (
  continuation: Continuation,
  scope: ListingScope,
  options: CursorOptions,
): CursorReading => unimplemented(continuation, scope, options);

export {
  cursorVersion,
  decodeCursorValue,
  encodeCursorValue,
  mintContinuation,
  mintCursor,
  parseContinuation,
  parseCursor,
};
export type { CursorContents, CursorOptions, CursorReading };
