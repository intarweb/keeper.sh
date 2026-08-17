import { hasOAuthProviderApi } from "@keeper.sh/auth";
import { auth, authCapabilities, env } from "@/context";
import { prepareOAuthTokenRequest } from "./auth-oauth-resource";
import { context, widelog } from "@/utils/logging";
import { resolveOutcome } from "@/utils/middleware";
import { labelFailure } from "@/utils/error-labelling";
import { isUnauthenticatedRequest, processAuthResponse } from "./auth-response";

const prepareUnauthenticatedRegisterRequest = async (
  pathname: string,
  request: Request,
): Promise<Request> => {
  if (pathname !== "/api/auth/oauth2/register") {
    return request;
  }

  if (request.method !== "POST") {
    return request;
  }

  if (!isUnauthenticatedRequest(request)) {
    return request;
  }

  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") {
    return request;
  }

  const modified = { ...body, token_endpoint_auth_method: "none" };
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(modified),
  });
};

const processAuth = async (pathname: string, request: Request): Promise<Response> => {
  if (pathname === "/api/auth/capabilities") {
    return Response.json(authCapabilities);
  }

  if (hasOAuthProviderApi(auth.api)) {
    if (pathname === "/api/auth/.well-known/oauth-authorization-server") {
      return Response.json(
        await auth.api.getOAuthServerConfig({
          headers: request.headers,
        }),
      );
    }

    if (pathname === "/api/auth/.well-known/openid-configuration") {
      return Response.json(
        await auth.api.getOpenIdConfig({
          headers: request.headers,
        }),
      );
    }
  }

  const preparedRequest = await prepareUnauthenticatedRegisterRequest(pathname, request);
  const preparedTokenRequest = await prepareOAuthTokenRequest({
    mcpPublicUrl: env.MCP_PUBLIC_URL,
    pathname,
    request: preparedRequest,
  });

  const response = await auth.handler(preparedTokenRequest.request);
  return processAuthResponse(pathname, response);
};

const handleAuthRequest = (pathname: string, request: Request): Promise<Response> =>
  context(async () => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    widelog.set("operation.name", `${request.method} ${pathname}`);
    widelog.set("operation.type", "auth");
    widelog.set("request.id", requestId);
    widelog.set("http.method", request.method);
    widelog.set("http.path", pathname);

    try {
      return await widelog.time.measure("duration_ms", async () => {
        const response = await processAuth(pathname, request);
        widelog.set("status_code", response.status);
        widelog.set("outcome", resolveOutcome(response.status));
        return response;
      });
    } catch (error) {
      widelog.set("status_code", 500);
      widelog.set("outcome", "error");
      labelFailure(error, { slug: "auth-request-failed" });
      throw error;
    } finally {
      widelog.flush();
    }
  });

export { handleAuthRequest };
