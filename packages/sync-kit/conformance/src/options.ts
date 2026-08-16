import type {
  Capabilities,
  Instant,
  InstallationId,
  OperationName,
  ProviderContract,
  ProviderFailure,
  ProviderId,
  RemoteEvent,
  WindowMembership,
  WriteIntent,
  WriteOutcome,
} from "@keeper.sh/sync-protocol";

interface TestClock {
  readonly now: () => Instant;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly advance: (milliseconds: number) => Promise<void>;
  readonly nowCount: () => number;
  readonly pendingTimers: () => number;
}

type TransportBehaviour =
  | { readonly kind: "pass" }
  | { readonly kind: "stall" }
  | { readonly kind: "reject"; readonly failure: ProviderFailure; readonly times: number }
  | { readonly kind: "throw"; readonly times: number };

interface TransportStub {
  readonly run: <Value>(operation: OperationName, execute: () => Promise<Value>) => Promise<Value>;
  readonly callCount: () => number;
  readonly inFlightPeak: () => number;
  readonly stall: () => void;
  readonly resume: () => void;
  readonly answerWith: (behaviour: TransportBehaviour) => void;
}

interface ConformanceEnvironment {
  readonly clock: TestClock;
  readonly hash: (input: string) => string;
  readonly installation: InstallationId;
  readonly transport: TransportStub;
}

interface WriteLogEntry {
  readonly at: Instant;
  readonly intent: WriteIntent;
  readonly outcome: WriteOutcome;
}

interface ProviderInspection {
  readonly objects: readonly RemoteEvent[];
  readonly writeLog: readonly WriteLogEntry[];
}

interface ProviderSeed {
  readonly events: readonly RemoteEvent[];
  readonly corruptKnownRows: readonly string[];
}

interface ProviderUnderTest<Provider extends ProviderId = ProviderId> {
  readonly contract: ProviderContract<Provider>;
  readonly seed: (seed: ProviderSeed) => Promise<void>;
  readonly inspect: () => Promise<ProviderInspection>;
  readonly dispose: () => Promise<void>;
}

type CreateProvider<Provider extends ProviderId = ProviderId> = (
  environment: ConformanceEnvironment,
) => Promise<ProviderUnderTest<Provider>>;

interface RunConformanceOptions<Provider extends ProviderId = ProviderId> {
  readonly name: string;
  readonly supports: Capabilities<Provider>;
  readonly create: CreateProvider<Provider>;
  readonly withinWindow: WindowMembership;
}

export type {
  ConformanceEnvironment,
  CreateProvider,
  ProviderInspection,
  ProviderSeed,
  ProviderUnderTest,
  RunConformanceOptions,
  TestClock,
  TransportBehaviour,
  TransportStub,
  WriteLogEntry,
};
