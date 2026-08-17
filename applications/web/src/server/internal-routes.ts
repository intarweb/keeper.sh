import fs from "node:fs/promises";
import path from "node:path";
import { GDPR_COUNTRIES } from "@/config/gdpr";
import { getGithubStarsSnapshot } from "./github-stars";
import { proxyRequest } from "./proxy/http";
import type { ServerConfig } from "./types";

const staticTextFiles: Record<string, string> = {
  "/llms.txt": "text/plain; charset=UTF-8",
  "/llms-full.txt": "text/plain; charset=UTF-8",
};

// OAuth clients discover the authorization server via /.well-known/* at
// the resource origin. The auth server lives under /api/auth, so these
// mappings proxy the well-known paths to the correct internal routes.
const internalProxyPaths = {
  "/.well-known/oauth-authorization-server": "/api/auth/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration": "/api/auth/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server/api/auth":
    "/api/auth/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration/api/auth":
    "/api/auth/.well-known/openid-configuration",
} as const;

const isInternalProxyPath = (
  pathname: string,
): pathname is keyof typeof internalProxyPaths =>
  pathname in internalProxyPaths;

const resolveInternalProxyPath = (pathname: string): string | null => {
  if (isInternalProxyPath(pathname)) return internalProxyPaths[pathname];
  return null;
};

const RESOURCE_SCOPES = [
  "keeper.read",
  "keeper.sources.read",
  "keeper.destinations.read",
  "keeper.mappings.read",
  "keeper.events.read",
  "keeper.sync-status.read",
];

const buildProtectedResourceMetadata = (requestOrigin: string) => ({
  resource: `${requestOrigin}/mcp`,
  authorization_servers: [`${requestOrigin}/api/auth`],
  scopes_supported: RESOURCE_SCOPES,
});

function associatedLinksResponse(pathname: string, config: ServerConfig): Response | null {
  if (pathname === "/.well-known/apple-app-site-association") {
    const appId = config.mobileAssociations?.iosAppId;
    if (!appId) return Response.json({ error: "iOS association is not configured" }, { status: 503 });
    return Response.json({
      applinks: {
        apps: [],
        details: [{ appIDs: [appId], components: [{ "/": "/open/*", comment: "Keeper mobile deep links" }] }],
      },
      webcredentials: { apps: [appId] },
    }, { headers: { "cache-control": "public, max-age=3600" } });
  }
  if (pathname === "/.well-known/assetlinks.json") {
    const association = config.mobileAssociations;
    if (!association?.androidSha256CertFingerprints.length) {
      return Response.json({ error: "Android association is not configured" }, { status: 503 });
    }
    return Response.json([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: association.androidPackageName,
        sha256_cert_fingerprints: association.androidSha256CertFingerprints,
      },
    }], { headers: { "cache-control": "public, max-age=3600" } });
  }
  return null;
}

async function serveStaticTextFile(pathname: string): Promise<Response | null> {
  const contentType = staticTextFiles[pathname];
  if (!contentType) return null;

  const filePath = path.resolve(process.cwd(), `public${pathname}`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return new Response(content, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

const resolvePublicOrigin = (request: Request): string => {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host");

  if (proto) {
    url.protocol = proto;
  }

  if (host) {
    url.host = host;
  }

  return url.origin;
};

export async function handleInternalRoute(
  request: Request,
  config: ServerConfig,
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  const requestUrl = new URL(request.url);

  const associationResponse = associatedLinksResponse(requestUrl.pathname, config);
  if (associationResponse) return associationResponse;

  if (requestUrl.pathname === "/.well-known/oauth-protected-resource") {
    return Response.json(buildProtectedResourceMetadata(resolvePublicOrigin(request)));
  }

  const internalProxyPath = resolveInternalProxyPath(requestUrl.pathname);

  if (internalProxyPath) {
    const proxyUrl = new URL(request.url);
    proxyUrl.pathname = internalProxyPath;

    return proxyRequest(new Request(proxyUrl, request), config.apiProxyOrigin);
  }

  if (requestUrl.pathname === "/internal/geo") {
    const countryCode = request.headers.get("cf-ipcountry") ?? "";
    const gdprApplies = config.environment === "development" || GDPR_COUNTRIES.has(countryCode);

    return Response.json(
      { gdprApplies },
      {
        headers: {
          "cache-control": "private, no-store",
          vary: "cf-ipcountry",
        },
      },
    );
  }

  if (requestUrl.pathname === "/internal/github-stars") {
    try {
      const snapshot = await getGithubStarsSnapshot();
      return Response.json(snapshot, {
        headers: {
          "cache-control": "no-store",
        },
      });
    } catch {
      return Response.json(
        { message: "Unable to read GitHub stars." },
        { status: 502 },
      );
    }
  }

  const staticResponse = await serveStaticTextFile(requestUrl.pathname);
  if (staticResponse) return staticResponse;

  return null;
}

export { resolveInternalProxyPath };
