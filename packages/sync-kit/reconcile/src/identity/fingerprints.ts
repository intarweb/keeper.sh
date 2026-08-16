import type { Fingerprint } from "@keeper.sh/sync-protocol";

interface SourceFingerprint {
  readonly kind: "sourceFingerprint";
  readonly value: Fingerprint;
}

interface MirrorFingerprint {
  readonly kind: "mirrorFingerprint";
  readonly value: Fingerprint;
}

const sourceFingerprintOf = (fingerprint: Fingerprint): SourceFingerprint => {
  throw new Error(`unimplemented: sourceFingerprintOf(${fingerprint.value})`);
};

const mirrorFingerprintOf = (fingerprint: Fingerprint): MirrorFingerprint => {
  throw new Error(`unimplemented: mirrorFingerprintOf(${fingerprint.value})`);
};

const sameSource = (left: SourceFingerprint, right: SourceFingerprint): boolean => {
  throw new Error(`unimplemented: sameSource(${left.kind}, ${right.kind})`);
};

const sameMirror = (left: MirrorFingerprint, right: MirrorFingerprint): boolean => {
  throw new Error(`unimplemented: sameMirror(${left.kind}, ${right.kind})`);
};

export { mirrorFingerprintOf, sameMirror, sameSource, sourceFingerprintOf };
export type { MirrorFingerprint, SourceFingerprint };
