import { isAllowedMobileReturnUrl } from "@keeper.sh/auth";

const NATIVE_CONTEXT_TTL_SECONDS = 10 * 60;
const NATIVE_TICKET_TTL_SECONDS = 5 * 60;
const CONTEXT_PREFIX = "mobile:oauth:context:";
const TICKET_PREFIX = "mobile:oauth:ticket:";
const TEXT_ENCODER = new TextEncoder();
const MAX_RETURN_URL_LENGTH = 2048;
const MAX_TICKET_LENGTH = 1024;

type NativeOAuthFlow = "destination" | "source";
type NativeOAuthStatus = "cancelled" | "error" | "success";

interface NativeOAuthContext {
  flow: NativeOAuthFlow;
  provider: string;
  returnUrl: string;
  sessionId: string;
  userId: string;
}

interface NativeOAuthTicketPayload {
  errorCode?: string;
  flow: NativeOAuthFlow;
  provider: string;
  resourceId?: string;
  sessionId: string;
  status: NativeOAuthStatus;
  userId: string;
}

interface StoredTicket extends NativeOAuthTicketPayload {
  expiresAt: number;
}

interface OneTimeStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  consume(key: string): Promise<string | null>;
}

interface NativeOAuthCoordinatorOptions {
  now?: () => number;
  secret: string;
  store: OneTimeStore;
  trustedOrigins: readonly string[];
}

const toBase64Url = (value: ArrayBuffer): string =>
  Buffer.from(value).toString("base64url");

const createSigningKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );

const sign = async (secret: string, value: string): Promise<string> => {
  const key = await createSigningKey(secret);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, TEXT_ENCODER.encode(value)));
};

const verifySignature = async (
  secret: string,
  value: string,
  signature: string,
): Promise<boolean> => {
  const signatureBytes = Buffer.from(signature, "base64url");
  if (signatureBytes.toString("base64url") !== signature) {
    return false;
  }
  const key = await createSigningKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    TEXT_ENCODER.encode(value),
  );
};

const contextKey = (providerState: string): string =>
  `${CONTEXT_PREFIX}${providerState}`;

const ticketKey = (ticketId: string): string => `${TICKET_PREFIX}${ticketId}`;

const createNativeOAuthCoordinator = (options: NativeOAuthCoordinatorOptions) => {
  const now = options.now ?? Date.now;

  const registerContext = async (
    providerState: string,
    context: NativeOAuthContext,
  ): Promise<void> => {
    if (
      context.returnUrl.length > MAX_RETURN_URL_LENGTH
      || !isAllowedMobileReturnUrl(context.returnUrl, options.trustedOrigins)
    ) {
      throw new Error("Mobile OAuth return URL is not allowlisted");
    }
    await options.store.set(
      contextKey(providerState),
      JSON.stringify(context),
      NATIVE_CONTEXT_TTL_SECONDS,
    );
  };

  const consumeContext = async (providerState: string): Promise<NativeOAuthContext | null> => {
    const value = await options.store.consume(contextKey(providerState));
    if (!value) {
      return null;
    }
    try {
      const context: NativeOAuthContext = JSON.parse(value);
      if (!isAllowedMobileReturnUrl(context.returnUrl, options.trustedOrigins)) {
        return null;
      }
      return context;
    } catch {
      return null;
    }
  };

  const issueTicket = async (payload: NativeOAuthTicketPayload): Promise<string> => {
    const ticketId = crypto.randomUUID();
    const expiresAt = now() + NATIVE_TICKET_TTL_SECONDS * 1000;
    const signature = await sign(options.secret, `${ticketId}.${expiresAt}`);
    const ticket = `${ticketId}.${expiresAt}.${signature}`;
    await options.store.set(
      ticketKey(ticketId),
      JSON.stringify({ ...payload, expiresAt } satisfies StoredTicket),
      NATIVE_TICKET_TTL_SECONDS,
    );
    return ticket;
  };

  const redeemTicket = async (
    ticket: string,
    binding: { sessionId: string; userId: string },
  ): Promise<Omit<StoredTicket, "sessionId" | "userId"> | null> => {
    if (ticket.length === 0 || ticket.length > MAX_TICKET_LENGTH) {
      return null;
    }
    const parts = ticket.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const [ticketId, rawExpiresAt, suppliedSignature] = parts;
    if (!ticketId || !rawExpiresAt || !suppliedSignature) {
      return null;
    }
    const expiresAt = Number(rawExpiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) {
      return null;
    }
    if (!await verifySignature(
      options.secret,
      `${ticketId}.${expiresAt}`,
      suppliedSignature,
    )) {
      return null;
    }

    // Consume before checking bindings so a stolen ticket cannot be probed repeatedly.
    const raw = await options.store.consume(ticketKey(ticketId));
    if (!raw) {
      return null;
    }
    try {
      const stored: StoredTicket = JSON.parse(raw);
      if (
        stored.expiresAt !== expiresAt
        || stored.expiresAt <= now()
        || stored.userId !== binding.userId
        || stored.sessionId !== binding.sessionId
      ) {
        return null;
      }
      const result: Omit<StoredTicket, "sessionId" | "userId"> = {
        expiresAt: stored.expiresAt,
        flow: stored.flow,
        provider: stored.provider,
        status: stored.status,
      };
      if (stored.errorCode) {
        result.errorCode = stored.errorCode;
      }
      if (stored.resourceId) {
        result.resourceId = stored.resourceId;
      }
      return result;
    } catch {
      return null;
    }
  };

  const buildReturnUrl = (returnUrl: string, ticket: string, status: NativeOAuthStatus): URL => {
    if (
      returnUrl.length > MAX_RETURN_URL_LENGTH
      || !isAllowedMobileReturnUrl(returnUrl, options.trustedOrigins)
    ) {
      throw new Error("Mobile OAuth return URL is not allowlisted");
    }
    const url = new URL(returnUrl);
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("status", status);
    return url;
  };

  return { buildReturnUrl, consumeContext, issueTicket, redeemTicket, registerContext };
};

export { createNativeOAuthCoordinator };
export type {
  NativeOAuthContext,
  NativeOAuthFlow,
  NativeOAuthStatus,
  NativeOAuthTicketPayload,
  OneTimeStore,
};
