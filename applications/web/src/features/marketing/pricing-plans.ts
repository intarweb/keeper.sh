import type {
  MarketingPricingFeatureValueKind,
  MarketingPricingPlanFeature,
} from "./components/marketing-pricing-section";

export type PricingPlanId = 'free' | 'pro';

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
      'Enough for two calendar accounts and three connections.',
    ctaLabel: 'Get Started',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$5',
    period: 'per month',
    description:
      'As many calendars as you want, and changes that land within a minute.',
    ctaLabel: 'Get Started',
    tone: "inverse" as const,
  },
];

export const PRICING_FEATURES: PricingFeature[] = [
  { label: 'Reading Your Calendars', free: 'Every 1 minute', pro: 'Every 1 minute' },
  { label: 'Updating Your Calendars', free: 'Every 30 minutes', pro: 'Every 1 minute' },
  { label: 'Calendar Accounts', free: 'Up to 2', pro: 'infinity' },
  { label: 'Connections', free: 'Up to 3', pro: 'infinity' },
  { label: 'Shareable Calendar Link', free: 'check', pro: 'check' },
  { label: 'Choose What The Link Shows', free: 'minus', pro: 'check' },
  { label: 'Event Filters', free: 'minus', pro: 'check' },
  { label: 'API & AI Agent Access', free: '25 calls/day', pro: 'infinity' },
  { label: 'Priority Support', free: 'minus', pro: 'check' },
];

export function pricingPlanFeatures(planId: PricingPlanId): MarketingPricingPlanFeature[] {
  return PRICING_FEATURES.map((feature) => ({ label: feature.label, value: feature[planId] }));
}
