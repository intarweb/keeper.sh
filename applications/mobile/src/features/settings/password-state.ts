export function hasCredentialPassword(accounts: unknown): boolean {
  return (
    Array.isArray(accounts) &&
    accounts.some((account) =>
      Boolean(
        account &&
          typeof account === "object" &&
          (account as { providerId?: unknown }).providerId === "credential",
      ),
    )
  );
}
