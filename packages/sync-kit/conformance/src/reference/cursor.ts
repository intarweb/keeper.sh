import type { ListingScope, Result, SyncCursor } from "@keeper.sh/sync-protocol";

interface CursorMint {
  readonly mint: (scope: ListingScope) => SyncCursor;
  readonly verify: (cursor: SyncCursor, scope: ListingScope) => Result<SyncCursor>;
  readonly generations: () => number;
  readonly expireAll: () => void;
}

const createCursorMint = (secret: string): CursorMint => {
  throw new Error(`unimplemented: createCursorMint(${secret.length})`);
};

export { createCursorMint };
export type { CursorMint };
