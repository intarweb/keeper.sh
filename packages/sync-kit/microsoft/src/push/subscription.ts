import type {
  CalendarId,
  Instant,
  OperationContext,
  Result,
} from "@keeper.sh/sync-protocol";
import type { RequestSeam } from "../client/request";
import type { MicrosoftDependencies } from "../dependencies";
import { unimplemented } from "../unimplemented";
import type { SubscriptionResource } from "./profile";

interface ProviderAccountId {
  readonly kind: "providerAccountId";
  readonly value: string;
}

interface SubscriptionScope {
  readonly kind: "subscriptionScope";
  readonly account: ProviderAccountId;
  readonly calendar: CalendarId;
}

const scopeRefusals = ["missingProviderAccountId"] as const;
type ScopeRefusal = (typeof scopeRefusals)[number];

type ScopeOutcome =
  | { readonly kind: "scoped"; readonly scope: SubscriptionScope }
  | { readonly kind: "withheld"; readonly reason: ScopeRefusal };

const subscriptionScopeOf = (candidate: {
  readonly providerAccountId: string | null;
  readonly calendar: CalendarId;
}): ScopeOutcome => unimplemented(candidate);

const resourcePathOf = (scope: SubscriptionScope, resource: SubscriptionResource): string =>
  unimplemented(scope, resource);

interface SubscriptionRequest {
  readonly scope: SubscriptionScope;
  readonly resource: SubscriptionResource;
  readonly includeResourceData: boolean;
  readonly notificationUrl: string;
  readonly lifecycleNotificationUrl: string;
  readonly clientState: string;
}

interface GraphSubscription {
  readonly id: string;
  readonly resource: string;
  readonly notificationUrl: string;
  readonly expiration: Instant;
  readonly includesResourceData: boolean;
  readonly createdAt: Instant;
}

interface SubscriptionSurroundings {
  readonly dependencies: MicrosoftDependencies;
  readonly requests: RequestSeam;
}

const registerSubscription = (
  request: SubscriptionRequest,
  context: OperationContext,
  surroundings: SubscriptionSurroundings,
): Promise<Result<GraphSubscription>> => unimplemented(request, context, surroundings);

const renewSubscription = (
  subscription: GraphSubscription,
  context: OperationContext,
  surroundings: SubscriptionSurroundings,
): Promise<Result<GraphSubscription>> => unimplemented(subscription, context, surroundings);

type DeleteSubscriptionOutcome =
  | { readonly kind: "deleted" }
  | { readonly kind: "alreadyGone" };

const deleteSubscription = (
  subscription: GraphSubscription,
  context: OperationContext,
  surroundings: SubscriptionSurroundings,
): Promise<Result<DeleteSubscriptionOutcome>> =>
  unimplemented(subscription, context, surroundings);

const listSubscriptions = (
  context: OperationContext,
  surroundings: SubscriptionSurroundings,
): Promise<Result<readonly GraphSubscription[]>> => unimplemented(context, surroundings);

export {
  deleteSubscription,
  listSubscriptions,
  registerSubscription,
  renewSubscription,
  resourcePathOf,
  scopeRefusals,
  subscriptionScopeOf,
};
export type {
  DeleteSubscriptionOutcome,
  GraphSubscription,
  ProviderAccountId,
  ScopeOutcome,
  ScopeRefusal,
  SubscriptionRequest,
  SubscriptionScope,
  SubscriptionSurroundings,
};
