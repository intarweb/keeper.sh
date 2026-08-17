import { withWideEvent } from "@/utils/middleware";
import { ErrorResponse } from "@/utils/responses";
import { widelog } from "@/utils/logging";
import { labelFailure } from "@/utils/error-labelling";
import {
  OAuthError,
  buildRedirectUrl,
  handleOAuthCallback,
  parseOAuthCallback,
} from "@/utils/oauth";
import { providerParamSchema } from "@/utils/request-query";
import { baseUrl } from "@/context";
import {
  buildNativeOAuthResponse,
  consumeNativeReturnContext,
  resolveNativeOAuthFailure,
} from "@/utils/mobile-oauth-return";

const GET = withWideEvent(async ({ request, params }) => {
  if (!params.provider || !providerParamSchema.allows(params)) {
    return ErrorResponse.notFound().toResponse();
  }
  const { provider } = params;
  const requestUrl = new URL(request.url);
  const nativeContext = await consumeNativeReturnContext(
    requestUrl.searchParams.get("state"),
    "destination",
    provider,
  );

  try {
    const callbackParams = parseOAuthCallback(request, provider);
    const { redirectUrl, userId } = await handleOAuthCallback(callbackParams);
    if (nativeContext) {
      if (nativeContext.userId !== userId) {
        throw new OAuthError("OAuth state user binding mismatch", redirectUrl);
      }
      return buildNativeOAuthResponse(nativeContext, {
        status: "success",
      });
    }
    return Response.redirect(redirectUrl.toString());
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
    const errorUrl = buildRedirectUrl("/dashboard/integrations", baseUrl, {
      destination: "error",
      error: "Failed to connect",
    });
    return Response.redirect(errorUrl.toString());
  }
});

export { GET };
