import type { MarketingPricingFeatureValueKind } from "./components/marketing-pricing-section";

export type PricingPlanId = "free" | "pro";

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  price: string;
  period: string;
  description: string;
  ctaLabel: string;
  tone?: "default" | "inverse";
};

export type PricingFeature = {
  label: string;
  free: MarketingPricingFeatureValueKind;
  pro: MarketingPricingFeatureValueKind;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'per month',
    description:
      'For personal use and getting started with calendar sync.',
    ctaLabel: 'Get Started',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$5',
    period: 'per month',
    description:
      'For power users who need fast syncs, advanced feed controls, and unlimited syncing.',
    ctaLabel: 'Get Started',
    tone: "inverse" as const,
  },
];

export const PRICING_FEATURES: PricingFeature[] = [
  { label: 'Reading Your Calendars', free: 'Every 1 minute', pro: 'Every 1 minute' },
  { label: 'Updating Your Calendars', free: 'Every 30 minutes', pro: 'Every 1 minute' },
  { label: 'Linked Accounts', free: 'Up to 2', pro: 'infinity' },
  { label: 'Sync Mappings', free: 'Up to 3', pro: 'infinity' },
  { label: 'Aggregated iCal Feed', free: 'check', pro: 'check' },
  { label: 'iCal Feed Customization', free: 'minus', pro: 'check' },
  { label: 'Event Filters & Exclusions', free: 'minus', pro: 'check' },
  { label: 'API & MCP Access', free: '25 calls/day', pro: 'infinity' },
  { label: 'Email & Passkey Sign-In', free: 'check', pro: 'check' },
  { label: 'Priority Support', free: 'minus', pro: 'check' },
];

/**
 * The rows where Free and Pro actually differ, in PRICING_FEATURES order. A row
 * that reads the same on both plans cannot decide the one question the landing
 * page asks — is Free enough for me — so it only costs vertical space there.
 * Derived rather than hand-listed, so this can never drift from the /pricing
 * matrix, which keeps every row.
 */
export const PRICING_FEATURE_DIFFERENCES: PricingFeature[] = PRICING_FEATURES.filter(
  (feature) => feature.free !== feature.pro,
);
