const COMPANION_COOKIE_NAME = "keeper.has_session";
const COMPANION_COOKIE_SET = `${COMPANION_COOKIE_NAME}=1; Path=/; SameSite=Lax`;
const COMPANION_COOKIE_CLEAR = `${COMPANION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;

const isNullSession = (body: unknown): body is null | { session: null } => {
  if (body === null) {
    return true;
  }
  return body !== null && typeof body === "object" && "session" in body && body.session === null;
};

const withCookie = (response: Response, cookie: string): Response => {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const clearSessionCookies = (response: Response): Response => {
  const expiredCookie = "Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
  let result = withCookie(response, `better-auth.session_token=; ${expiredCookie}`);
  result = withCookie(result, `better-auth.session_data=; ${expiredCookie}`);
  return withCookie(result, COMPANION_COOKIE_CLEAR);
};

const hasSessionCookie = (response: Response, cleared: boolean): boolean =>
  response.headers.getSetCookie().some((cookie) =>
    cookie.includes("better-auth.session_token=")
    && cookie.includes("Max-Age=0") === cleared);

const processAuthResponse = async (pathname: string, response: Response): Promise<Response> => {
  if (hasSessionCookie(response, false)) {
    return withCookie(response, COMPANION_COOKIE_SET);
  }
  if (hasSessionCookie(response, true)) {
    return withCookie(response, COMPANION_COOKIE_CLEAR);
  }
  if (pathname !== "/api/auth/get-session") {
    return response;
  }
  const body = await response.clone().json().catch(() => null);
  if (isNullSession(body)) {
    return clearSessionCookies(response);
  }
  return response;
};

const isUnauthenticatedRequest = (request: Request): boolean => {
  const authorization = request.headers.get("authorization");
  if (authorization?.trim()) {
    return false;
  }
  return !request.headers.get("cookie")?.includes("better-auth.session_token=");
};

export { isNullSession, isUnauthenticatedRequest, processAuthResponse };
