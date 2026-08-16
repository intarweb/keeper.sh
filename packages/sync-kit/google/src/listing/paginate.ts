import type { calendar_v3 } from "@googleapis/calendar";
import type { OperationContext } from "@keeper.sh/sync-protocol";
import type { GoogleFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";

type PageWalk =
  | {
      readonly kind: "complete";
      readonly items: readonly calendar_v3.Schema$Event[];
      readonly syncToken: string;
      readonly pagesFetched: number;
    }
  | {
      readonly kind: "truncated";
      readonly items: readonly calendar_v3.Schema$Event[];
      readonly pageToken: string;
      readonly pagesFetched: number;
    }
  | { readonly kind: "cursorLost" }
  | { readonly kind: "failed"; readonly failure: GoogleFailure };

interface PaginateOptions {
  readonly context: OperationContext;
  readonly maxPages: number;
  readonly fetchPage: (
    pageToken: string | null,
  ) => Promise<calendar_v3.Schema$Events | GoogleFailure>;
}

const paginateEvents = (options: PaginateOptions): Promise<PageWalk> => unimplemented(options);

export { paginateEvents };
export type { PageWalk, PaginateOptions };
