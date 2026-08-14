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
  /**
   * Short noun phrase for the plan cards, per plan. Rows without one for a plan
   * stay in the matrix only. The card bullets are read from here so a plan
   * limit is written down once and the two surfaces cannot drift.
   */
  highlight?: Partial<Record<PricingPlanId, string>>;
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
  {
    label: 'Updating Your Calendars',
    free: 'Every 30 minutes',
    pro: 'Every 1 minute',
    highlight: { free: 'Updates every 30 minutes', pro: 'Updates every minute' },
  },
  {
    label: 'Linked Accounts',
    free: 'Up to 2',
    pro: 'infinity',
    highlight: { free: 'Up to 2 linked accounts', pro: 'Unlimited linked accounts' },
  },
  {
    label: 'Sync Mappings',
    free: 'Up to 3',
    pro: 'infinity',
    highlight: { free: 'Up to 3 connections', pro: 'Unlimited connections' },
  },
  { label: 'Aggregated iCal Feed', free: 'check', pro: 'check' },
  { label: 'iCal Feed Customization', free: 'minus', pro: 'check' },
  {
    label: 'Event Filters & Exclusions',
    free: 'minus',
    pro: 'check',
    highlight: { pro: 'Event filters and exclusions' },
  },
  {
    label: 'API & MCP Access',
    free: '25 calls/day',
    pro: 'infinity',
    highlight: { free: '25 API and MCP calls a day', pro: 'Unlimited API and MCP calls' },
  },
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

/**
 * The rows that separate the plans, as card bullets for one plan. Order follows
 * PRICING_FEATURES so the cards read in the same order as the matrix. Derived
 * from the same rows the matrix renders, so the bullets shown below `md` and
 * the table shown at `md` and up cannot disagree.
 */
export function pricingPlanHighlights(planId: PricingPlanId): string[] {
  return PRICING_FEATURES.flatMap((feature) => feature.highlight?.[planId] ?? []);
}
