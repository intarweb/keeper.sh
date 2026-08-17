import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { MobileApi } from "@/api/mobile-api";
import { userPreferencePrefix } from "@/storage/preferences";

const INSTALLATION_ID_KEY = "keeper-installation-id";

export function pushEnabledPreferenceKey(
  profileId: string,
  userId: string,
): string {
  return `${userPreferencePrefix(profileId, userId)}push-enabled`;
}

export function pushErrorPreferenceKey(
  profileId: string,
  userId: string,
): string {
  return `${userPreferencePrefix(profileId, userId)}push-error`;
}

export async function getInstallationId(
  create: boolean,
): Promise<string | null> {
  let installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!installationId && create) {
    installationId = Crypto.randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  }
  return installationId;
}

export async function revokeCurrentPush(api: MobileApi): Promise<boolean> {
  const installationId = await getInstallationId(false);
  if (!installationId) return false;
  await api.client.revokeMobileDevice(installationId);
  return true;
}
