import type { NotAttemptedReason, OperationContext } from "@keeper.sh/sync-protocol";
import type { MicrosoftClock } from "../dependencies";
import type { MicrosoftFailure } from "../errors/classify";
import { unimplemented } from "../unimplemented";

interface GraphPage {
  readonly items: readonly unknown[];
  readonly nextLink: string | null;
  readonly deltaLink: string | null;
}

type PageAnswer =
  | { readonly kind: "page"; readonly page: GraphPage }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

type PageWalk =
  | {
      readonly kind: "complete";
      readonly items: readonly unknown[];
      readonly deltaLink: string;
      readonly pagesFetched: number;
    }
  | {
      readonly kind: "truncated";
      readonly items: readonly unknown[];
      readonly nextLink: string;
      readonly pagesFetched: number;
      readonly stoppedBy: "pageCeiling" | "repeatedLink" | "loopDeadline";
    }
  | { readonly kind: "cursorLost" }
  | { readonly kind: "failed"; readonly failure: MicrosoftFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

interface PaginateOptions {
  readonly context: OperationContext;
  readonly clock: MicrosoftClock;
  readonly maxPages: number;
  readonly fetchPage: (link: string | null) => Promise<PageAnswer>;
}

const paginateGraph = (options: PaginateOptions): Promise<PageWalk> => unimplemented(options);

export { paginateGraph };
export type { GraphPage, PageAnswer, PageWalk, PaginateOptions };
