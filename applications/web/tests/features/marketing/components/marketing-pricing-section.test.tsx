import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentPropsWithoutRef<"a">) => <a {...props}>{children}</a>,
}));

let MarketingPricingPlanCard: typeof import("../../../../src/features/marketing/components/marketing-pricing-section").MarketingPricingPlanCard;
let PRICING_FEATURES: typeof import("../../../../src/features/marketing/pricing-plans").PRICING_FEATURES;
let PRICING_PLANS: typeof import("../../../../src/features/marketing/pricing-plans").PRICING_PLANS;
let pricingPlanFeatures: typeof import("../../../../src/features/marketing/pricing-plans").pricingPlanFeatures;

beforeAll(async () => {
  ({ MarketingPricingPlanCard } = await import(
    "../../../../src/features/marketing/components/marketing-pricing-section"
  ));
  ({ PRICING_FEATURES, PRICING_PLANS, pricingPlanFeatures } = await import(
    "../../../../src/features/marketing/pricing-plans"
  ));
});

function renderPlanCard(planId: "free" | "pro") {
  const plan = PRICING_PLANS.find((candidate) => candidate.id === planId)!;

  return renderToStaticMarkup(
    <MarketingPricingPlanCard
      tone={plan.tone}
      name={plan.name}
      price={plan.price}
      period={plan.period}
      description={plan.description}
      ctaLabel={plan.ctaLabel}
      features={pricingPlanFeatures(plan.id)}
    />,
  );
}

describe("pricingPlanFeatures", () => {
  it("derives per-plan values from the shared feature list", () => {
    expect(pricingPlanFeatures("free")).toEqual(
      PRICING_FEATURES.map((feature) => ({ label: feature.label, value: feature.free })),
    );
    expect(pricingPlanFeatures("pro")).toEqual(
      PRICING_FEATURES.map((feature) => ({ label: feature.label, value: feature.pro })),
    );
  });
});

describe("MarketingPricingPlanCard", () => {
  it("lists every feature label inside the card for narrow viewports", () => {
    const { document } = parseHTML(`<html><body>${renderPlanCard("free")}</body></html>`);
    const list = document.querySelector("dl");

    expect(list?.className).toContain("md:hidden");
    expect([...document.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(
      PRICING_FEATURES.map((feature) => feature.label),
    );
  });

  it("renders the value each plan gets for a feature", () => {
    const { document } = parseHTML(`<html><body>${renderPlanCard("free")}</body></html>`);
    const values = [...document.querySelectorAll("dd")].map((value) => value.textContent);

    expect(values).toContain("Up to 2");
    expect(values).toContain("Every 30 minutes");
  });

  it("keeps the plan name as the only heading in the card", () => {
    const { document } = parseHTML(`<html><body>${renderPlanCard("pro")}</body></html>`);
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];

    expect(headings.map((heading) => heading.tagName.toLowerCase())).toEqual(["h3"]);
    expect(headings[0]?.textContent).toBe("Pro");
  });
});
