export interface PasskeySummary {
  createdAt: string | null;
  id: string;
  name: string | null;
}

interface PasskeyFetchResult {
  data?: unknown;
  error?: unknown;
}

export interface PasskeyApiClient {
  $fetch(
    path: string,
    options: { body?: Record<string, unknown>; method: "GET" | "POST" },
  ): Promise<PasskeyFetchResult>;
}

export function canUseNativePasskeys(
  serverSupportsPasskeys: boolean | null | undefined,
  hostedProfile: boolean,
): boolean {
  return serverSupportsPasskeys === true && hostedProfile;
}

function validDate(value: unknown): Date | null {
  if (
    !(value instanceof Date) &&
    typeof value !== "string" &&
    typeof value !== "number"
  )
    return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizePasskeys(value: unknown): PasskeySummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as {
      createdAt?: unknown;
      id?: unknown;
      name?: unknown;
    };
    if (typeof candidate.id !== "string" || !candidate.id.trim()) return [];
    const name =
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : null;
    return [
      {
        createdAt: validDate(candidate.createdAt)?.toISOString() ?? null,
        id: candidate.id,
        name,
      },
    ];
  });
}

export function passkeyName(passkey: Pick<PasskeySummary, "name">): string {
  return passkey.name ?? "Passkey";
}

export function passkeyCreatedLabel(
  passkey: Pick<PasskeySummary, "createdAt">,
  locales?: Intl.LocalesArgument,
): string {
  const date = validDate(passkey.createdAt);
  return date
    ? `Created ${date.toLocaleDateString(locales)}`
    : "Creation date unavailable";
}

export function passkeyErrorMessage(
  error: unknown,
  fallback: string,
  cancellationMessage = "Passkey request was cancelled.",
): string {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "AUTH_CANCELLED") return cancellationMessage;
  return typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message
    : fallback;
}

export async function listNativePasskeys(
  auth: PasskeyApiClient,
): Promise<PasskeySummary[]> {
  const result = await auth.$fetch("/passkey/list-user-passkeys", {
    method: "GET",
  });
  if (result.error)
    throw new Error(
      passkeyErrorMessage(result.error, "Could not load your passkeys."),
    );
  if (!Array.isArray(result.data))
    throw new Error("The server returned an invalid passkey list.");
  return normalizePasskeys(result.data);
}

export async function deleteNativePasskey(
  auth: PasskeyApiClient,
  id: string,
): Promise<void> {
  const result = await auth.$fetch("/passkey/delete-passkey", {
    method: "POST",
    body: { id },
  });
  if (result.error)
    throw new Error(
      passkeyErrorMessage(result.error, "Could not delete this passkey."),
    );
}
