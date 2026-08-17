import { type } from "entrykit";
import type { ServerConfig } from "./types";

export const envSchema = type({
  VITE_API_URL: "string.url",
  VITE_MCP_URL: "string.url?",
  ENV: "'development'|'production'|'test' = 'production'",
  PORT: "string",
  "MOBILE_IOS_TEAM_ID?": "string",
  "MOBILE_IOS_BUNDLE_ID?": "string",
  "MOBILE_ANDROID_PACKAGE_NAME?": "string",
  "MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS?": "string",
});

const SHA256_FINGERPRINT = /^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;

function resolveMobileAssociations(environment: typeof envSchema.infer): ServerConfig["mobileAssociations"] {
  const iosTeamId = environment.MOBILE_IOS_TEAM_ID?.trim();
  const iosBundleId = environment.MOBILE_IOS_BUNDLE_ID?.trim() || "sh.keeper.mobile";
  const fingerprints = (environment.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (fingerprints.some((value) => !SHA256_FINGERPRINT.test(value))) {
    throw new Error("MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS must contain comma-separated SHA-256 certificate fingerprints");
  }
  return {
    androidPackageName: environment.MOBILE_ANDROID_PACKAGE_NAME?.trim() || "sh.keeper.mobile",
    androidSha256CertFingerprints: fingerprints,
    iosAppId: iosTeamId ? `${iosTeamId}.${iosBundleId}` : null,
  };
}

function parsePort(variableName: string, value: string): number {
  const port = Number(value);
  const isValidPort = Number.isInteger(port) && port > 0 && port <= 65535;
  if (!isValidPort) {
    throw new Error(`${variableName} must be an integer between 1 and 65535`);
  }
  return port;
}

function deriveVitePort(serverPort: number): number {
  const derivedPort = serverPort + 1;
  if (derivedPort > 65535) {
    throw new Error("PORT must be less than 65535 to derive a Vite development port.");
  }

  return derivedPort;
}

export function createServerConfig(environment: typeof envSchema.infer): ServerConfig {
  const serverPort = parsePort("PORT", environment.PORT);
  const vitePort = deriveVitePort(serverPort);
  const runtimeEnvironment = environment.ENV;

  return {
    apiProxyOrigin: environment.VITE_API_URL,
    mcpProxyOrigin: environment.VITE_MCP_URL ?? null,
    environment: runtimeEnvironment,
    isProduction: runtimeEnvironment === "production",
    serverPort,
    vitePort,
    mobileAssociations: resolveMobileAssociations(environment),
  };
}
