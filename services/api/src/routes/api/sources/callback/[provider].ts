import { withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";
import { widelog } from "@/utils/logging";
import { labelFailure } from "@/utils/error-labelling";
import { buildRedirectUrl, OAuthError } from "@/utils/oauth";
import { oauthCallbackQuerySchema, providerParamSchema } from "@/utils/request-query";
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  validateState,
} from "@/utils/destinations";
import { createOAuthSourceCredential } from "@/utils/oauth-source-credentials";
import { importOAuthAccountCalendars } from "@/utils/oauth-sources";
import { baseUrl } from "@/context";
import {
  buildNativeOAuthResponse,
  consumeNativeReturnContext,
  resolveNativeOAuthFailure,
} from "@/utils/mobile-oauth-return";

const MS_PER_SECOND = 1000;

const GET = withWideEvent(async ({ request, params }) => {
  if (!params.provider || !providerParamSchema.allows(params)) {
    return ErrorResponse.notFound().toResponse();
  }

  widelog.set("provider.name", params.provider);

  const { provider } = params;
  const requestUrl = new URL(request.url);
  const nativeContext = await consumeNativeReturnContext(
    requestUrl.searchParams.get("state"),
    "source",
    provider,
  );

  const errorUrl = buildRedirectUrl("/dashboard/integrations", baseUrl, {
    error: "Failed to connect source",
    source: "error",
  });

  try {
    const url = requestUrl;
    const callbackQuery = Object.fromEntries(url.searchParams.entries());
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (!oauthCallbackQuerySchema.allows(callbackQuery)) {
      throw new OAuthError("Invalid callback query parameters", errorUrl);
    }

    if (error) {
      throw new OAuthError("OAuth error from provider", errorUrl);
    }

    if (!code || !state) {
      throw new OAuthError("Missing code or state", errorUrl);
    }

    const validatedState = await validateState(state);
    if (!validatedState) {
      throw new OAuthError("Invalid or expired state", errorUrl);
    }

    const { userId } = validatedState;
    if (nativeContext && nativeContext.userId !== userId) {
      throw new OAuthError("OAuth state user binding mismatch", errorUrl);
    }

    const callbackUrl = new URL(`/api/sources/callback/${provider}`, baseUrl);
    const tokens = await exchangeCodeForTokens(provider, code, callbackUrl.toString());

    if (!tokens.refresh_token) {
      throw new OAuthError("No refresh token", errorUrl);
    }

    const userInfo = await fetchUserInfo(provider, tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * MS_PER_SECOND);

    const credentialId = await createOAuthSourceCredential(userId, {
      accessToken: tokens.access_token,
      email: userInfo.email,
      expiresAt,
      provider,
      refreshToken: tokens.refresh_token,
    });

    const accountId = await importOAuthAccountCalendars({
      accessToken: tokens.access_token,
      email: userInfo.email,
      oauthCredentialId: credentialId,
      provider,
      userId,
    });

    const successUrl = buildRedirectUrl(`/dashboard/accounts/${accountId}/setup`, baseUrl);
    if (nativeContext) {
      return buildNativeOAuthResponse(nativeContext, {
        resourceId: accountId,
        status: "success",
      });
    }
    return Response.redirect(successUrl.toString());
  } catch (error) {
    if (error instanceof OAuthError) {
      widelog.errorFields(error, { slug: "oauth-callback-failed" });
      if (nativeContext) {
        return buildNativeOAuthResponse(
          nativeContext,
          resolveNativeOAuthFailure(requestUrl.searchParams.get("error")),
        );
      }
      return Response.redirect(error.redirectUrl.toString());
    }

    labelFailure(error, { slug: "unclassified" });
    if (nativeContext) {
      return buildNativeOAuthResponse(nativeContext, {
        errorCode: "oauth_failed",
        status: "error",
      });
    }
    return Response.redirect(errorUrl.toString());
  }
});

export { GET };
