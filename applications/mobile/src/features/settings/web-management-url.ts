export function passkeyManagementUrl(baseUrl: string): string {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:")
    throw new Error("Passkey management requires an HTTPS Keeper server.");
  return new URL("/dashboard/settings/passkeys", origin.origin).toString();
}
