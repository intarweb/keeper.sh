import {
  DEFAULT_ECHO_ADOPTION_MAX_PER_RUN,
  DEFAULT_ECHO_MAX_AGE_MS,
} from "../sync/operations";
import type { EchoComparisonMode } from "../sync/operations";

interface EchoConfig {
  adoptionEnabled: boolean;
  maxAdoptionsPerRun: number;
  maxAgeMs: number;
  mode: EchoComparisonMode;
  repairOnAdopt: boolean;
}

type EchoEnvironment = Record<string, string | undefined>;

const ECHO_COMPARISON_MODES: EchoComparisonMode[] = ["off", "shadow", "on"];

const readMode = (value?: string): EchoComparisonMode => {
  if (!value) {
    return "off";
  }
  const mode = ECHO_COMPARISON_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new Error(
      `KEEPER_ECHO_COMPARISON must be one of ${ECHO_COMPARISON_MODES.join(", ")}`,
    );
  }
  return mode;
};

const readSwitch = (name: string, fallback: boolean, value?: string): boolean => {
  if (!value) {
    return fallback;
  }
  if (value === "on") {
    return true;
  }
  if (value === "off") {
    return false;
  }
  throw new Error(`${name} must be either on or off`);
};

const readPositiveInteger = (
  name: string,
  fallback: number,
  value?: string,
): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

/*
 * Read once where the sync engine is wired up: a mode change is a container restart,
 * never a per-run decision, so every calendar in a process shares one declared state.
 */
const resolveEchoConfig = (environment: EchoEnvironment): EchoConfig => ({
  adoptionEnabled: readSwitch(
    "KEEPER_ECHO_ADOPTION",
    true,
    environment["KEEPER_ECHO_ADOPTION"],
  ),
  maxAdoptionsPerRun: readPositiveInteger(
    "KEEPER_ECHO_ADOPTION_MAX_PER_RUN",
    DEFAULT_ECHO_ADOPTION_MAX_PER_RUN,
    environment["KEEPER_ECHO_ADOPTION_MAX_PER_RUN"],
  ),
  maxAgeMs: readPositiveInteger(
    "KEEPER_ECHO_MAX_AGE_MS",
    DEFAULT_ECHO_MAX_AGE_MS,
    environment["KEEPER_ECHO_MAX_AGE_MS"],
  ),
  mode: readMode(environment["KEEPER_ECHO_COMPARISON"]),
  repairOnAdopt: readSwitch(
    "KEEPER_ECHO_REPAIR_ON_ADOPT",
    false,
    environment["KEEPER_ECHO_REPAIR_ON_ADOPT"],
  ),
});

export { resolveEchoConfig };
export type { EchoConfig };
