import type { ObservedPrecondition, RemoteVersion } from "@keeper.sh/sync-protocol";
import { unimplemented } from "../unimplemented";

type MicrosoftPrecondition =
  | { readonly kind: "enforced"; readonly ifMatch: string }
  | { readonly kind: "verified"; readonly expected: RemoteVersion };

const enforcedPrecondition = (precondition: ObservedPrecondition): MicrosoftPrecondition =>
  unimplemented(precondition);

const verifiedPrecondition = (precondition: ObservedPrecondition): MicrosoftPrecondition =>
  unimplemented(precondition);

const matchesObserved = (
  precondition: ObservedPrecondition,
  observed: RemoteVersion,
): boolean => unimplemented(precondition, observed);

export { enforcedPrecondition, matchesObserved, verifiedPrecondition };
export type { MicrosoftPrecondition };
