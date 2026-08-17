import { expoClient } from "@better-auth/expo/client";
import type { BetterAuthClientPlugin } from "better-auth";
import { createAuthClient } from "better-auth/react";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import * as SecureStore from "expo-secure-store";

import type { ServerProfile } from "@/storage/server-profile";
import type { UserSession } from "@/api/domain";
import { parseSecureCachedSession } from "@/auth/offline-session";

type ExpoPasskeyPlugin = ReturnType<typeof expoPasskeyClient>;
type ExpoPasskeyActions = ReturnType<ExpoPasskeyPlugin["getActions"]>;

// expo-better-auth-passkey 1.4.x models its server plugin with Better Auth
// 1.4 types. Its runtime client actions are compatible with Better Auth 1.5,
// but the private server-plugin error types are not structurally assignable.
type CompatibleExpoPasskeyPlugin = Omit<
  ExpoPasskeyPlugin,
  "$InferServerPlugin"
> &
  BetterAuthClientPlugin;

function secureStoreKey(
  profileId: string,
  suffix: "cookie" | "session_data",
): string {
  return `keeper-${profileId}_${suffix}`.replace(/:/g, "_");
}

export async function migrateLegacyAuthStorage(
  profile: ServerProfile,
): Promise<void> {
  if (!profile.legacyId || profile.legacyId === profile.id) return;
  for (const suffix of ["cookie", "session_data"] as const) {
    const from = secureStoreKey(profile.legacyId, suffix);
    const to = secureStoreKey(profile.id, suffix);
    const existing = await SecureStore.getItemAsync(to);
    const legacy = await SecureStore.getItemAsync(from);
    if (!existing && legacy) await SecureStore.setItemAsync(to, legacy);
    await SecureStore.deleteItemAsync(from);
  }
}

export async function clearAuthStorage(profile: ServerProfile): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(secureStoreKey(profile.id, "cookie")),
    SecureStore.deleteItemAsync(secureStoreKey(profile.id, "session_data")),
  ]);
}

export function createKeeperAuthClient(profile: ServerProfile) {
  const passkeyClient =
    expoPasskeyClient() as unknown as CompatibleExpoPasskeyPlugin;
  const client = createAuthClient({
    baseURL: profile.baseUrl,
    plugins: [
      expoClient({
        scheme: "keeper",
        storage: SecureStore,
        storagePrefix: `keeper-${profile.id}`,
        cookiePrefix: "better-auth",
      }),
      passkeyClient,
    ],
  });
  return client as typeof client & {
    signIn: typeof client.signIn & ExpoPasskeyActions["signIn"];
  };
}

export type KeeperAuthClient = ReturnType<typeof createKeeperAuthClient>;

export function readSecureCachedSession(
  profile: ServerProfile,
  auth: KeeperAuthClient,
): UserSession | null {
  return parseSecureCachedSession(
    SecureStore.getItem(secureStoreKey(profile.id, "session_data")),
    auth.getCookie(),
  );
}
