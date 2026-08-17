import { describe, expect, it } from "vitest";

import {
  canUseNativePasskeys,
  deleteNativePasskey,
  listNativePasskeys,
  normalizePasskeys,
  passkeyCreatedLabel,
  passkeyErrorMessage,
  passkeyName,
  type PasskeyApiClient,
} from "@/auth/passkey-logic";

describe("native passkey boundary", () => {
  it("requires both server support and a matching hosted entitlement", () => {
    expect(canUseNativePasskeys(true, true)).toBe(true);
    expect(canUseNativePasskeys(true, false)).toBe(false);
    expect(canUseNativePasskeys(false, true)).toBe(false);
    expect(canUseNativePasskeys(undefined, true)).toBe(false);
  });

  it("normalizes Better Auth passkeys and discards malformed records", () => {
    const passkeys = normalizePasskeys([
      {
        id: "passkey-1",
        name: "  iPhone  ",
        createdAt: "2026-08-14T12:00:00.000Z",
        publicKey: "secret",
      },
      { id: "passkey-2", name: "", createdAt: "not-a-date" },
      { id: 3, name: "invalid" },
      null,
    ]);

    expect(passkeys).toEqual([
      {
        id: "passkey-1",
        name: "iPhone",
        createdAt: "2026-08-14T12:00:00.000Z",
      },
      { id: "passkey-2", name: null, createdAt: null },
    ]);
    expect(passkeyName(passkeys[1]!)).toBe("Passkey");
    expect(passkeyCreatedLabel(passkeys[1]!)).toBe("Creation date unavailable");
  });

  it("returns an empty list for an unexpected endpoint response", () => {
    expect(normalizePasskeys({ id: "not-a-list" })).toEqual([]);
  });

  it("distinguishes user cancellation from server failures", () => {
    expect(
      passkeyErrorMessage(
        { code: "AUTH_CANCELLED", message: "native error" },
        "Failed",
        "Cancelled",
      ),
    ).toBe("Cancelled");
    expect(
      passkeyErrorMessage({ message: "Relying party mismatch" }, "Failed"),
    ).toBe("Relying party mismatch");
    expect(passkeyErrorMessage(null, "Failed")).toBe("Failed");
  });

  it("uses Better Auth's native-safe list and delete endpoints", async () => {
    const calls: Array<{ path: string; options: unknown }> = [];
    const auth: PasskeyApiClient = {
      $fetch: async (path, options) => {
        calls.push({ path, options });
        return path.includes("list")
          ? {
              data: [
                { id: "passkey-1", name: "Phone", createdAt: "2026-08-14" },
              ],
            }
          : { data: { success: true } };
      },
    };

    await expect(listNativePasskeys(auth)).resolves.toHaveLength(1);
    await expect(
      deleteNativePasskey(auth, "passkey-1"),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([
      { path: "/passkey/list-user-passkeys", options: { method: "GET" } },
      {
        path: "/passkey/delete-passkey",
        options: { method: "POST", body: { id: "passkey-1" } },
      },
    ]);
  });

  it("surfaces endpoint errors instead of treating them as empty success", async () => {
    const auth: PasskeyApiClient = {
      $fetch: async () => ({ error: { message: "Session expired" } }),
    };
    await expect(listNativePasskeys(auth)).rejects.toThrow("Session expired");
    await expect(deleteNativePasskey(auth, "passkey-1")).rejects.toThrow(
      "Session expired",
    );

    const malformed: PasskeyApiClient = {
      $fetch: async () => ({ data: { passkeys: [] } }),
    };
    await expect(listNativePasskeys(malformed)).rejects.toThrow(
      "invalid passkey list",
    );
  });
});
