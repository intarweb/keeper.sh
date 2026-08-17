import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type { AuthCapabilities, UserSession } from "@/api/domain";
import { MobileApi } from "@/api/mobile-api";
import {
  clearAuthStorage,
  createKeeperAuthClient,
  migrateLegacyAuthStorage,
  readSecureCachedSession,
  type KeeperAuthClient,
} from "@/auth/auth-client";
import { clearCacheProfile, clearCacheScope } from "@/offline/cache";
import { revokeCurrentPush } from "@/notifications/device-state";
import {
  createServerProfile,
  hostedProfile,
  readServerProfile,
  validateServer,
  writeServerProfile,
  type ServerProfile,
} from "@/storage/server-profile";
import {
  clearProfileUserPreferences,
  clearUserPreferences,
} from "@/storage/preferences";
import {
  decideStartupSession,
  type SessionFetchState,
} from "@/auth/startup-session";

interface AppContextValue {
  api: MobileApi;
  auth: KeeperAuthClient;
  capabilities: AuthCapabilities | null;
  clearCurrentUserData(): Promise<void>;
  error: string | null;
  handleUnauthorized(): Promise<void>;
  loading: boolean;
  profile: ServerProfile;
  refreshSession(): Promise<UserSession | null>;
  session: UserSession | null;
  setProfile(profile: ServerProfile): Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function asSession(value: unknown): UserSession | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("user" in value) ||
    !("session" in value)
  )
    return null;
  return value as UserSession;
}

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setCurrentProfile] = useState(readServerProfile);
  const [session, setSession] = useState<UserSession | null>(null);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const auth = useMemo(() => createKeeperAuthClient(profile), [profile]);
  const api = useMemo(
    () => new MobileApi(profile.baseUrl, auth),
    [auth, profile.baseUrl],
  );

  const clearUserData = useCallback(
    async (targetProfile: ServerProfile, userId: string | null) => {
      if (userId) {
        await clearCacheScope(`${targetProfile.id}:${userId}`);
        clearUserPreferences(targetProfile.id, userId);
      }
      await clearCacheScope(`${targetProfile.id}:anonymous`);
      await clearAuthStorage(targetProfile);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    const result = await auth.getSession();
    if (result.error)
      throw new Error(result.error.message ?? "Could not refresh the session.");
    const next = asSession(result.data);
    setSession(next);
    return next;
  }, [auth]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void (async () => {
      await migrateLegacyAuthStorage(profile);
      const cachedBeforeRequest = readSecureCachedSession(profile, auth);
      const [capabilityResult, sessionResult] = await Promise.allSettled([
        api.client.getAuthCapabilities(),
        auth.getSession(),
      ]);
      if (!live) return;
      if (capabilityResult.status === "fulfilled")
        setCapabilities(capabilityResult.value);
      else setCapabilities(null);

      let fetchState: SessionFetchState;
      if (sessionResult.status === "rejected")
        fetchState = { error: sessionResult.reason, kind: "error" };
      else if (sessionResult.value.error)
        fetchState = { error: sessionResult.value.error, kind: "error" };
      else
        fetchState = {
          kind: "success",
          session: asSession(sessionResult.value.data),
        };
      const decision = decideStartupSession(fetchState, cachedBeforeRequest);
      setSession(decision.session);
      if (decision.kind === "unauthorized" || decision.kind === "signed-out") {
        if (decision.kind === "unauthorized") {
          await clearUserData(profile, cachedBeforeRequest?.user.id ?? null);
          await clearCacheProfile(profile.id);
          clearProfileUserPreferences(profile.id);
        } else if (cachedBeforeRequest)
          await clearUserData(profile, cachedBeforeRequest.user.id);
        if (decision.kind === "unauthorized") {
          setCapabilities(null);
          setError("Your Keeper session expired. Sign in again.");
        }
      } else if (decision.kind === "offline") {
        setError("Offline mode: showing securely cached read-only data.");
      } else if (decision.kind === "unavailable") {
        const reason =
          capabilityResult.status === "rejected"
            ? capabilityResult.reason
            : decision.error;
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not connect to Keeper.sh.",
        );
      } else if (capabilityResult.status === "rejected") {
        setError(
          capabilityResult.reason instanceof Error
            ? capabilityResult.reason.message
            : "Could not load server capabilities.",
        );
      }
    })()
      .catch((reason: unknown) => {
        if (live)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not initialize Keeper.sh.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api.client, auth, clearUserData, profile]);

  const setProfile = useCallback(
    async (nextProfile: ServerProfile) => {
      const normalized = createServerProfile(nextProfile.baseUrl);
      await validateServer(normalized.baseUrl);
      if (normalized.baseUrl === profile.baseUrl) return;
      if (session) {
        try {
          await revokeCurrentPush(api);
        } catch {
          /* profile isolation cleanup must continue */
        }
      }
      try {
        await auth.signOut();
      } catch {
        /* local secure auth state is cleared explicitly below */
      }
      await clearUserData(profile, session?.user.id ?? null);
      await clearCacheProfile(profile.id);
      writeServerProfile({
        ...normalized,
        name: nextProfile.name || normalized.name,
      });
      setSession(null);
      setCapabilities(null);
      setCurrentProfile({
        ...normalized,
        name: nextProfile.name || normalized.name,
      });
    },
    [api, auth, clearUserData, profile, session],
  );

  const clearCurrentUserData = useCallback(async () => {
    await clearUserData(profile, session?.user.id ?? null);
  }, [clearUserData, profile, session?.user.id]);

  const handleUnauthorized = useCallback(async () => {
    const userId = session?.user.id ?? null;
    setSession(null);
    setError("Your Keeper session expired. Sign in again.");
    await clearUserData(profile, userId);
  }, [clearUserData, profile, session?.user.id]);

  const value = useMemo<AppContextValue>(
    () => ({
      api,
      auth,
      capabilities,
      clearCurrentUserData,
      error,
      handleUnauthorized,
      loading,
      profile,
      refreshSession,
      session,
      setProfile,
    }),
    [
      api,
      auth,
      capabilities,
      clearCurrentUserData,
      error,
      handleUnauthorized,
      loading,
      profile,
      refreshSession,
      session,
      setProfile,
    ],
  );

  return <AppContext value={value}>{children}</AppContext>;
}

export function useApp(): AppContextValue {
  const value = use(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider");
  return value;
}

export function resetToHostedProfile(): void {
  writeServerProfile(hostedProfile);
}
