import { unimplemented } from "../unimplemented";
import type { GraphLifecycleEvent } from "./lifecycle";
import type { RichHint } from "./resource-data";

const pushRejections = [
  "oversizedBody",
  "unreadableBody",
  "unsupportedMethod",
  "noClaims",
] as const;

type PushRejection = (typeof pushRejections)[number];

interface GraphPushClaim {
  readonly subscriptionId: string;
  readonly presentedClientState: string | null;
  readonly lifecycle: GraphLifecycleEvent | null;
  readonly hint: RichHint | null;
}

type GraphPushSignal =
  | { readonly kind: "validation"; readonly token: string }
  | { readonly kind: "notification"; readonly claims: readonly GraphPushClaim[] }
  | { readonly kind: "rejected"; readonly reason: PushRejection };

interface GraphPushRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | null;
}

const decodeGraphPush = (request: GraphPushRequest): GraphPushSignal => unimplemented(request);

export { decodeGraphPush, pushRejections };
export type { GraphPushClaim, GraphPushRequest, GraphPushSignal, PushRejection };
