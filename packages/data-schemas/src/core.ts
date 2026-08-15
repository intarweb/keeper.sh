import { type } from "arktype";

import { SYNC_RANGE_DEFINITIONS } from "./constants";

const proxyableMethods = type("'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS'");
type ProxyableMethods = typeof proxyableMethods.infer;

const planSchema = type("'free' | 'pro'");
type Plan = typeof planSchema.infer;

const stringSchema = type("string");

const syncRangeSchema = type.enumerated(
  ...SYNC_RANGE_DEFINITIONS.map(({ value }) => value),
);
type SyncRange = typeof syncRangeSchema.infer;

const billingPeriodSchema = type("'monthly' | 'yearly'");
type BillingPeriod = typeof billingPeriodSchema.infer;

/* A feed name is shown to the user and must survive a round trip, so an
 * all-whitespace name is rejected rather than silently stored. */
const icalFeedNameSchema = type("string >= 1").narrow(
  (value) => value.trim().length > 0,
);

const pushChannelStateSchema = type(
  "'active' | 'degraded' | 'failed' | 'registering' | 'removed'",
);
type PushChannelStateValue = typeof pushChannelStateSchema.infer;

const apiErrorBodySchema = type({ error: "string | null" });
type ApiErrorBody = typeof apiErrorBodySchema.infer;

const readApiErrorMessage = (body: unknown): string | null => {
  if (!apiErrorBodySchema.allows(body)) {
    return null;
  }
  return body.error;
};

export {
  apiErrorBodySchema,
  billingPeriodSchema,
  icalFeedNameSchema,
  planSchema,
  proxyableMethods,
  pushChannelStateSchema,
  readApiErrorMessage,
  stringSchema,
  syncRangeSchema,
};

export type {
  ApiErrorBody,
  BillingPeriod,
  Plan,
  ProxyableMethods,
  PushChannelStateValue,
  SyncRange,
};
