import { describe, expect, it } from "vitest";
import { handleInternalRoute, resolveInternalProxyPath } from "../../src/server/internal-routes";
import type { ServerConfig } from "../../src/server/types";

describe("resolveInternalProxyPath", () => {
  it("maps OAuth authorization-server metadata to the API auth handler", () => {
    expect(resolveInternalProxyPath("/.well-known/oauth-authorization-server")).toBe(
      "/api/auth/.well-known/oauth-authorization-server",
    );
  });

  it("maps OpenID metadata to the API auth handler", () => {
    expect(resolveInternalProxyPath("/.well-known/openid-configuration")).toBe(
      "/api/auth/.well-known/openid-configuration",
    );
  });

  it("maps path-suffixed OAuth metadata to the API auth handler", () => {
    expect(resolveInternalProxyPath("/.well-known/oauth-authorization-server/api/auth")).toBe(
      "/api/auth/.well-known/oauth-authorization-server",
    );
  });

  it("maps path-suffixed OpenID metadata to the API auth handler", () => {
    expect(resolveInternalProxyPath("/.well-known/openid-configuration/api/auth")).toBe(
      "/api/auth/.well-known/openid-configuration",
    );
  });

  it("returns null for regular application routes", () => {
    expect(resolveInternalProxyPath("/dashboard")).toBeNull();
  });
});

const geoConfig: ServerConfig = {
  apiProxyOrigin: "http://api.test",
  mcpProxyOrigin: null,
  environment: "production",
  isProduction: true,
  serverPort: 4000,
  vitePort: 4001,
};

function geoRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/internal/geo", { headers });
}

describe("/internal/geo", () => {
  it("reports that GDPR applies for an EU country", async () => {
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "DE" }), geoConfig);

    expect(await response?.json()).toEqual({ gdprApplies: true });
  });

  it("reports that GDPR does not apply outside the EU", async () => {
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "US" }), geoConfig);

    expect(await response?.json()).toEqual({ gdprApplies: false });
  });

  it("is never stored by a shared cache", async () => {
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "US" }), geoConfig);

    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("mobile app associations", () => {
  const associationConfig: ServerConfig = {
    ...geoConfig,
    mobileAssociations: {
      androidPackageName: "sh.keeper.mobile",
      androidSha256CertFingerprints: ["AA:".repeat(31) + "AA"],
      iosAppId: "TEAM123456.sh.keeper.mobile",
    },
  };

  it("serves AASA for only the repository-owned open-link route", async () => {
    const response = await handleInternalRoute(new Request("https://keeper.sh/.well-known/apple-app-site-association"), associationConfig);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("application/json");
    expect(await response?.json()).toEqual({
      applinks: { apps: [], details: [{ appIDs: ["TEAM123456.sh.keeper.mobile"], components: [{ "/": "/open/*", comment: "Keeper mobile deep links" }] }] },
      webcredentials: { apps: ["TEAM123456.sh.keeper.mobile"] },
    });
  });

  it("serves Android asset links with configured signing fingerprints", async () => {
    const response = await handleInternalRoute(new Request("https://keeper.sh/.well-known/assetlinks.json"), associationConfig);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "sh.keeper.mobile", sha256_cert_fingerprints: ["AA:".repeat(31) + "AA"] },
    }]);
  });

  it("fails closed instead of publishing invented signing identities", async () => {
    const response = await handleInternalRoute(new Request("https://keeper.sh/.well-known/assetlinks.json"), geoConfig);
    expect(response?.status).toBe(503);
  });
});
