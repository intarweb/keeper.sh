import type { calendar_v3 } from "@googleapis/calendar";
import type { NotAttemptedReason, OperationContext } from "@keeper.sh/sync-protocol";
import { assertNever } from "@keeper.sh/sync-protocol";
import { remainingMilliseconds } from "../client/deadline";
import type { GoogleClock } from "../dependencies";
import type { GoogleFailure } from "../errors/classify";

type PageAnswer =
  | { readonly kind: "page"; readonly page: calendar_v3.Schema$Events }
  | { readonly kind: "failed"; readonly failure: GoogleFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

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
  | { readonly kind: "failed"; readonly failure: GoogleFailure }
  | { readonly kind: "notAttempted"; readonly reason: NotAttemptedReason };

interface PaginateOptions {
  readonly context: OperationContext;
  readonly clock: GoogleClock;
  readonly maxPages: number;
  readonly fetchPage: (pageToken: string | null) => Promise<PageAnswer>;
}

const itemsOf = (page: calendar_v3.Schema$Events): readonly calendar_v3.Schema$Event[] =>
  page.items ?? [];

const nextTokenOf = (page: calendar_v3.Schema$Events): string | null => {
  const token = page.nextPageToken;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  return token;
};

const syncTokenOf = (page: calendar_v3.Schema$Events): string | null => {
  const token = page.nextSyncToken;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  return token;
};

const outOfTime = (options: PaginateOptions): boolean =>
  remainingMilliseconds(options.context, options.clock) <= 0;

const paginateEvents = async (options: PaginateOptions): Promise<PageWalk> => {
  const collected: calendar_v3.Schema$Event[] = [];
  let pageToken: string | null = null;
  let pagesFetched = 0;
  while (pagesFetched < options.maxPages) {
    if (outOfTime(options)) {
      return { kind: "notAttempted", reason: "budgetExhausted" };
    }
    const answered: PageAnswer = await options.fetchPage(pageToken);
    switch (answered.kind) {
      case "failed": {
        if (answered.failure.kind === "cursorLost") {
          return { kind: "cursorLost" };
        }
        return { kind: "failed", failure: answered.failure };
      }
      case "notAttempted": {
        return { kind: "notAttempted", reason: answered.reason };
      }
      case "page": {
        pagesFetched += 1;
        collected.push(...itemsOf(answered.page));
        const next = nextTokenOf(answered.page);
        if (next === null) {
          const syncToken = syncTokenOf(answered.page);
          if (syncToken === null) {
            return { kind: "cursorLost" };
          }
          return { kind: "complete", items: collected, syncToken, pagesFetched };
        }
        pageToken = next;
        break;
      }
      default: {
        return assertNever(answered);
      }
    }
  }
  if (pageToken === null) {
    return { kind: "cursorLost" };
  }
  return { kind: "truncated", items: collected, pageToken, pagesFetched };
};

export { paginateEvents };
export type { PageAnswer, PageWalk, PaginateOptions };
