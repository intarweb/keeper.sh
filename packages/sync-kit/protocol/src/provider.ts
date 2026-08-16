import type { AccountId, Instant, ProviderId } from "./handles";
import type { CalendarEnumeration } from "./calendar-ref";
import type { ChangeListing, Continuation, ListingScope, SyncCursor } from "./change-listing";
import type { EditableContent } from "./remote-event";
import type { NormalizedContent, WriteIntent } from "./write-intent";
import type { WriteOutcome } from "./write-outcome";
import type { Capabilities } from "./capabilities";
import type { Result } from "./result";

interface RetryBudget {
  readonly maxAttempts?: number;
  readonly ceilingMs?: number;
}

interface OperationContext {
  readonly signal?: AbortSignal;
  readonly now: () => Instant;
  readonly retryBudget?: RetryBudget;
}

interface ListChangesRequest {
  readonly scope: ListingScope;
  readonly resume?: SyncCursor | Continuation | null;
}

interface CalendarProvider<Provider extends ProviderId = ProviderId> {
  readonly capabilities: Capabilities<Provider>;
  listCalendars(account: AccountId): Promise<Result<CalendarEnumeration>>;
  listChanges(request: ListChangesRequest): Promise<Result<ChangeListing>>;
  normalize(content: EditableContent): NormalizedContent<Provider>;
  write(intent: WriteIntent<Provider>): Promise<WriteOutcome>;
}

export type { CalendarProvider, ListChangesRequest, OperationContext, RetryBudget };
