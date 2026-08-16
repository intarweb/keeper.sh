import type { IcsLimits } from "../options";

interface IcsPatchCoercion {
  readonly params: string;
  readonly value: string;
}

interface IcsPatch {
  readonly properties: readonly string[];
  readonly coerce: (params: string, value: string) => IcsPatchCoercion | null;
}

const unreadableReasons = [
  "emptyBody",
  "noCalendarObject",
  "componentBoundaryMismatch",
  "limitExceeded",
] as const;
type UnreadableReason = (typeof unreadableReasons)[number];

type PatchOutcome =
  | { readonly kind: "patched"; readonly text: string }
  | { readonly kind: "refused"; readonly reason: UnreadableReason };

const applyIcsPatches = (
  _body: string,
  _patches: readonly IcsPatch[],
  _limits: IcsLimits): PatchOutcome => {
  throw new Error("unimplemented");
};

export { applyIcsPatches, unreadableReasons };
export type { IcsPatch, IcsPatchCoercion, PatchOutcome, UnreadableReason };
