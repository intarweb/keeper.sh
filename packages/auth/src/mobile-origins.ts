const KEEPER_SCHEME = "keeper:";
const DEFAULT_MOBILE_ORIGINS = ["keeper://"];

const normalizeOrigin = (value: string): string => value.trim();

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const assertMobileOrigin = (value: string): string => {
  const origin = normalizeOrigin(value);
  if (!origin) {
    throw new Error("Mobile trusted origins must not be empty");
  }
  if (origin.includes("*")) {
    throw new Error(`Mobile trusted origin must not contain a wildcard: ${origin}`);
  }

  const url = parseUrl(origin);
  if (!url) {
    throw new Error(`Invalid mobile trusted origin: ${origin}`);
  }

  if (url.protocol === KEEPER_SCHEME) {
    if (url.username || url.password) {
      throw new Error("Keeper deep-link origins must not contain credentials");
    }
    return origin;
  }

  if (url.protocol !== "https:") {
    throw new Error(`Mobile associated-link origins must use HTTPS: ${origin}`);
  }
  if (url.username || url.password || url.port) {
    throw new Error(`Mobile associated-link origins must be a bare HTTPS origin: ${origin}`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`Mobile associated-link origins must not include a path: ${origin}`);
  }

  return url.origin;
};

const parseMobileTrustedOrigins = (raw?: string): string[] => {
  if (!raw?.trim()) {
    return [...DEFAULT_MOBILE_ORIGINS];
  }
  return [...new Set(raw.split(",").map((origin) => assertMobileOrigin(origin)))];
};

const isAllowedMobileReturnUrl = (value: string, trustedOrigins: readonly string[]): boolean => {
  const candidate = parseUrl(value);
  if (!candidate) {
    return false;
  }

  if (candidate.username || candidate.password) {
    return false;
  }

  let isOAuthCallback = candidate.pathname === "/open/oauth/callback";
  if (candidate.protocol === KEEPER_SCHEME) {
    isOAuthCallback = candidate.hostname === "oauth" && candidate.pathname === "/callback";
  }
  if (!isOAuthCallback || candidate.search || candidate.hash) {
    return false;
  }

  return trustedOrigins.some((entry) => {
    const trusted = new URL(entry);
    if (trusted.protocol === KEEPER_SCHEME) {
      return candidate.protocol === KEEPER_SCHEME;
    }
    return candidate.protocol === "https:" && candidate.origin === trusted.origin;
  });
};

export { assertMobileOrigin, isAllowedMobileReturnUrl, parseMobileTrustedOrigins };
