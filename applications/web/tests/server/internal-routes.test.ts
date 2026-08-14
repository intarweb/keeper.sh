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

const serverConfig: ServerConfig = {
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
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "DE" }), serverConfig);

    expect(await response?.json()).toEqual({ gdprApplies: true });
  });

  it("reports that GDPR does not apply outside the EU", async () => {
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "US" }), serverConfig);

    expect(await response?.json()).toEqual({ gdprApplies: false });
  });

  it("is never stored by a shared cache", async () => {
    const response = await handleInternalRoute(geoRequest({ "cf-ipcountry": "US" }), serverConfig);

    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });
});

function serverCardRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/mcp/server-card", { headers });
}

describe("/mcp/server-card", () => {
  it("serves the card under the server card media type", async () => {
    const response = await handleInternalRoute(serverCardRequest(), serverConfig);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toContain("application/mcp-server-card+json");
  });

  it("names the server under the namespace the registry manifest publishes", async () => {
    const response = await handleInternalRoute(serverCardRequest(), serverConfig);

    expect(await response?.json()).toMatchObject({
      name: "sh.keeper/keeper",
      version: "1.0.0",
    });
  });

  it("points at the Streamable HTTP endpoint on the requested origin", async () => {
    const response = await handleInternalRoute(serverCardRequest(), serverConfig);

    expect(await response?.json()).toMatchObject({
      remotes: [{ type: "streamable-http", url: "http://localhost/mcp" }],
    });
  });

  it("advertises the endpoint on the public origin behind a proxy", async () => {
    const response = await handleInternalRoute(
      serverCardRequest({ "x-forwarded-proto": "https", "x-forwarded-host": "www.keeper.sh" }),
      serverConfig,
    );

    expect(await response?.json()).toMatchObject({
      remotes: [{ url: "https://www.keeper.sh/mcp" }],
      websiteUrl: "https://www.keeper.sh",
    });
  });

  it("leaves the primitives it serves to runtime listing", async () => {
    const response = await handleInternalRoute(serverCardRequest(), serverConfig);
    const card = await response?.json();

    expect(card).not.toHaveProperty("capabilities");
    expect(card).not.toHaveProperty("serverInfo");
  });
});
