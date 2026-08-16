import type { ListingScope, SyncCursor } from "@keeper.sh/sync-protocol";
import type { ListingMode } from "./fingerprint";
import { unimplemented } from "../unimplemented";

const cursorVersion = 1;

interface CursorContents {
  readonly version: number;
  readonly mode: ListingMode;
  readonly windowFingerprint: string;
  readonly providerToken: string;
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
  providerToken: string,
  options: CursorOptions,
): SyncCursor => unimplemented(scope, providerToken, options);

const parseCursor = (
  cursor: SyncCursor,
  scope: ListingScope,
  options: CursorOptions,
): CursorReading => unimplemented(cursor, scope, options);

export { cursorVersion, decodeCursorValue, encodeCursorValue, mintCursor, parseCursor };
export type { CursorContents, CursorOptions, CursorReading };
