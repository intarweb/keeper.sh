export function normalizeServerUrl(input: string): string {
  const value = input.trim().replace(/\/$/, "");
  if (!value || value.length > 512)
    throw new Error("Enter a valid Keeper server URL.");
  const parsed = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    parsed.protocol !== "https:" &&
    !isLocalDevelopmentHost(parsed.hostname)
  ) {
    throw new Error("Keeper servers must use HTTPS.");
  }
  if (parsed.username || parsed.password)
    throw new Error("Keeper server URLs cannot contain credentials.");
  if (parsed.hash)
    throw new Error("Keeper server URLs cannot contain fragments.");
  if (parsed.search)
    throw new Error("Keeper server URLs cannot contain query parameters.");
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export function profileIdForNormalizedUrl(baseUrl: string): string {
  const normalized = normalizeServerUrl(baseUrl);
  const encoded = Array.from(new TextEncoder().encode(normalized), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `server-${encoded}`;
}

export function canonicalizeHostedServerUrl(
  input: string,
  configuredBaseUrl: string,
): string {
  const normalized = normalizeServerUrl(input);
  const configured = normalizeServerUrl(configuredBaseUrl);
  return configured === "https://www.keeper.sh" &&
    normalized === "https://keeper.sh"
    ? configured
    : normalized;
}

function isLocalDevelopmentHost(host: string): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"))
  );
}
