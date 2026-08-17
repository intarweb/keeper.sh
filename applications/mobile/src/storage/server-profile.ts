import "expo-sqlite/localStorage/install";

import Constants from "expo-constants";
import {
  canonicalizeHostedServerUrl,
  normalizeServerUrl,
  profileIdForNormalizedUrl,
} from "@/storage/server-url";

const PROFILE_KEY = "keeper.server-profile.v1";

function configuredHostedUrl(): string {
  return normalizeServerUrl(
    String(
      Constants.expoConfig?.extra?.defaultServerUrl ?? "https://www.keeper.sh",
    ),
  );
}

function canonicalizeHostedUrl(baseUrl: string): string {
  return canonicalizeHostedServerUrl(baseUrl, configuredHostedUrl());
}

export interface ServerProfile {
  id: string;
  name: string;
  baseUrl: string;
  hosted: boolean;
  legacyId?: string;
}

export function profileIdForBaseUrl(baseUrl: string): string {
  const normalized = canonicalizeHostedUrl(baseUrl);
  if (normalized === configuredHostedUrl()) return "hosted";
  return profileIdForNormalizedUrl(normalized);
}

export function createServerProfile(baseUrl: string): ServerProfile {
  const normalized = canonicalizeHostedUrl(baseUrl);
  const hosted = profileIdForBaseUrl(normalized) === "hosted";
  const host = new URL(normalized).host;
  return {
    id: profileIdForBaseUrl(normalized),
    name: hosted ? "Keeper.sh" : host,
    baseUrl: normalized,
    hosted,
  };
}

export const hostedProfile: ServerProfile = createServerProfile(
  configuredHostedUrl(),
);

export function readServerProfile(): ServerProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return hostedProfile;
    const storedProfile = JSON.parse(stored) as ServerProfile;
    const profile = createServerProfile(storedProfile.baseUrl);
    return {
      ...profile,
      name: storedProfile.name || profile.name,
      legacyId: storedProfile.id === profile.id ? undefined : storedProfile.id,
    };
  } catch {
    return hostedProfile;
  }
}

export function writeServerProfile(profile: ServerProfile): void {
  const normalized = createServerProfile(profile.baseUrl);
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({ ...normalized, name: profile.name || normalized.name }),
  );
}

export async function validateServer(baseUrl: string): Promise<void> {
  const response = await fetch(`${normalizeServerUrl(baseUrl)}/api/health`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    throw new Error("This server did not respond as a Keeper.sh instance.");
}

export { normalizeServerUrl } from "@/storage/server-url";
