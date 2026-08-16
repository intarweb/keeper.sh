import { unimplemented } from "../unimplemented";

const pushRejections = ["unknownChannel", "badToken", "missingHeaders", "unknownState"] as const;
type PushRejection = (typeof pushRejections)[number];

type PushSignal =
  | { readonly kind: "handshake" }
  | { readonly kind: "changed"; readonly channelId: string; readonly resourceId: string }
  | { readonly kind: "unrecognised"; readonly reason: PushRejection };

const decodePushSignal = (headers: Headers): PushSignal => unimplemented(headers);

export { decodePushSignal, pushRejections };
export type { PushRejection, PushSignal };
