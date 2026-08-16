interface FingerprintContract {
  readonly canonicalisation: string;
}

type ProviderConformanceSuite = Record<string, () => void>;

export type { FingerprintContract, ProviderConformanceSuite };
