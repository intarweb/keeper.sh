import { nativeOAuth } from "@/context";
import type {
  NativeOAuthContext,
  NativeOAuthFlow,
  NativeOAuthStatus,
} from "./mobile-oauth";

const consumeNativeReturnContext = async (
  providerState: string | null,
  flow: NativeOAuthFlow,
  provider: string,
): Promise<NativeOAuthContext | null> => {
  if (!providerState) {
    return null;
  }
  const context = await nativeOAuth.consumeContext(providerState);
  if (!context || context.flow !== flow || context.provider !== provider) {
    return null;
  }
  return context;
};

const buildNativeOAuthReturn = async (
  context: NativeOAuthContext,
  input: { errorCode?: string; resourceId?: string; status: NativeOAuthStatus },
): Promise<URL> => {
  const payload = {
    flow: context.flow,
    provider: context.provider,
    sessionId: context.sessionId,
    status: input.status,
    userId: context.userId,
  };
  const optionalPayload: { errorCode?: string; resourceId?: string } = {};
  if (input.errorCode) {
    optionalPayload.errorCode = input.errorCode;
  }
  if (input.resourceId) {
    optionalPayload.resourceId = input.resourceId;
  }
  const ticket = await nativeOAuth.issueTicket({ ...payload, ...optionalPayload });
  return nativeOAuth.buildReturnUrl(context.returnUrl, ticket, input.status);
};

const buildNativeOAuthResponse = async (
  context: NativeOAuthContext,
  input: { errorCode?: string; resourceId?: string; status: NativeOAuthStatus },
): Promise<Response> => {
  const url = await buildNativeOAuthReturn(context, input);
  return Response.redirect(url.toString());
};

const resolveNativeOAuthFailure = (
  providerError: string | null,
): { errorCode: string; status: "cancelled" | "error" } => {
  if (providerError === "access_denied") {
    return { errorCode: "provider_cancelled", status: "cancelled" };
  }
  return { errorCode: "oauth_failed", status: "error" };
};

export {
  buildNativeOAuthResponse,
  buildNativeOAuthReturn,
  consumeNativeReturnContext,
  resolveNativeOAuthFailure,
};
