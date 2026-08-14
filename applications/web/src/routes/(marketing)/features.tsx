import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Heading1, Heading2, Heading3 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { ButtonIcon, ButtonText, ExternalLinkButton, LinkButton } from "@/components/ui/primitives/button";
import { MarketingCtaCard, MarketingCtaSection } from "@/features/marketing/components/marketing-cta";
import {
  MarketingFeatureBentoBody,
  MarketingFeatureBentoCard,
  MarketingFeatureBentoGrid,
  MarketingFeatureBentoIllustration,
  MarketingFeatureBentoSection,
} from "@/features/marketing/components/marketing-feature-bento";
import {
  MarketingHowItWorksCard,
  MarketingHowItWorksRow,
  MarketingHowItWorksSection,
  MarketingHowItWorksStepBody,
  MarketingHowItWorksStepIllustration,
} from "@/features/marketing/components/marketing-how-it-works";
import { MarketingIllustrationContributors } from "@/illustrations/marketing-illustration-contributors";
import { MarketingIllustrationProviders } from "@/illustrations/marketing-illustration-providers";
import { MarketingIllustrationSetup } from "@/illustrations/marketing-illustration-setup";
import { MarketingIllustrationSync } from "@/illustrations/marketing-illustration-sync";
import { HowItWorksConnect } from "@/illustrations/how-it-works-connect";
import { HowItWorksConfigure } from "@/illustrations/how-it-works-configure";
import { HowItWorksSync } from "@/illustrations/how-it-works-sync";
import { canonicalUrl, jsonLdScript, seoMeta, webPageSchema, breadcrumbSchema, breadcrumbTrail } from "@/lib/seo";
import { Breadcrumb } from "@/components/ui/primitives/breadcrumb";
import { ANALYTICS_EVENTS } from "@/lib/analytics";
import ArrowRightIcon from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRightIcon from "lucide-react/dist/esm/icons/arrow-up-right";

const breadcrumbs = breadcrumbTrail({ name: "Features", path: "/features" });

const PAGE_DESCRIPTION =
  "Keeper.sh copies events from one calendar into another and combines everything you connect into a single feed. Works with Google Calendar, Outlook, iCloud, Fastmail, and more.";

type FeatureCard = {
  title: string;
  body: string;
  gridClassName: string;
  illustration?: ReactNode;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: "Works with the calendars you already use",
    body: "Sign in to Google Calendar, Outlook, iCloud, or Fastmail. Other calendars connect with a link you paste in, or over the CalDAV standard they already support.",
    gridClassName: "lg:col-start-1 lg:col-span-4 lg:row-start-1",
    illustration: <MarketingIllustrationProviders />,
  },
  {
    title: "One calendar link with everything in it",
    body: "Every calendar you connect also lands in a single link. Subscribe to it from any calendar app and your whole week shows up in one place.",
    gridClassName: "lg:col-start-5 lg:col-span-6 lg:row-start-1",
    illustration: <MarketingIllustrationSync />,
  },
  {
    title: "Share that you are busy, not what you are doing",
    body: "The link hides titles, descriptions, and locations by default. Every event reads “Busy”, so you can hand it to a colleague without handing over your schedule. On Pro you pick which details it keeps and what the stand-in title says.",
    gridClassName: "lg:col-start-1 lg:col-span-6 lg:row-start-2",
  },
  {
    title: "Connections go one way",
    body: "A connection copies events from one calendar into another. If you want both calendars to match, connect them in both directions.",
    gridClassName: "lg:col-start-7 lg:col-span-4 lg:row-start-2",
    illustration: <MarketingIllustrationSetup />,
  },
  {
    title: "Copies that stay right",
    body: "Move an event and the copy moves. Delete it and the copy goes too. Your other calendar gets corrected instead of collecting duplicates.",
    gridClassName: "lg:col-start-1 lg:col-span-5 lg:row-start-3",
  },
  {
    title: "Open-source, and yours to run",
    body: "Keeper.sh is open-source under AGPL-3.0, with Docker images ready to deploy. Run it yourself and every account on it gets the Pro feature set, with no plan limits.",
    gridClassName: "lg:col-start-6 lg:col-span-5 lg:row-start-3",
    illustration: <MarketingIllustrationContributors />,
  },
  {
    title: "Let an assistant handle the scheduling",
    body: "Keeper.sh is an MCP server, so Claude, Cursor, or any MCP client can read your week and make changes across every calendar you have connected — not just one account. You approve it once on a consent screen, and you can revoke it whenever you like.",
    gridClassName: "lg:col-start-1 lg:col-span-6 lg:row-start-4",
  },
  {
    title: "Or build on it yourself",
    body: "A REST API under /api/v1, authenticated with a token you create under Settings → API Tokens. The free plan allows 25 calls a day; Pro is uncapped.",
    gridClassName: "lg:col-start-7 lg:col-span-4 lg:row-start-4",
  },
];

type UpdateStep = {
  title: string;
  body: string;
  note?: string;
};

const UPDATE_STEPS: UpdateStep[] = [
  {
    title: "Connect a calendar, then say where it copies to",
    body: "Connecting takes a sign-in or a pasted link. You then point that calendar at the one you want its events to land in.",
  },
  {
    title: "Choose what each calendar shows",
    body: "You set this per calendar. A work calendar can carry the title, description, and location while a shared one shows a plain block. On Pro you can also filter out events you would rather not copy at all.",
  },
  {
    title: "Keeper.sh takes it from there",
    body: "Your calendars are checked every minute on both plans. Google and Outlook only report what changed, so checking stays quick even on a packed calendar. A change reaches your other calendars within 30 minutes on Free, and within a minute on Pro.",
    note: "Calendars connected by a link are read in full each time.",
  },
];

export const Route = createFileRoute("/(marketing)/features")({
  component: FeaturesPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl("/features") }],
    meta: seoMeta({
      title: "Features",
      description: PAGE_DESCRIPTION,
      path: "/features",
    }),
    scripts: [
      jsonLdScript(webPageSchema("Features", PAGE_DESCRIPTION, "/features")),
      jsonLdScript(breadcrumbSchema(breadcrumbs)),
    ],
  }),
});

function FeaturesPage() {
  return (
    <div className="flex flex-col gap-6 py-16">
      <Breadcrumb items={breadcrumbs} />
      <header className="flex flex-col gap-1.5">
        <Heading1>Features</Heading1>
        <Text size="base" tone="muted" className="max-w-[64ch] leading-6">
          {PAGE_DESCRIPTION}
        </Text>
      </header>

      <MarketingFeatureBentoSection>
        <MarketingFeatureBentoGrid>
          {FEATURE_CARDS.map((card) => (
            <MarketingFeatureBentoCard key={card.title} className={card.gridClassName}>
              <MarketingFeatureBentoIllustration plain={!!card.illustration}>
                {card.illustration}
              </MarketingFeatureBentoIllustration>
              <MarketingFeatureBentoBody>
                <Heading3 as="h2">{card.title}</Heading3>
                <Text size="sm" className="text-left">{card.body}</Text>
              </MarketingFeatureBentoBody>
            </MarketingFeatureBentoCard>
          ))}
        </MarketingFeatureBentoGrid>
      </MarketingFeatureBentoSection>

      <MarketingHowItWorksSection>
        <Heading2>How your calendars stay in step</Heading2>
        <Text size="sm" tone="muted" className="mt-2 max-w-[64ch]">
          You set a connection up once. After that, Keeper.sh keeps the copies right.
        </Text>
        <MarketingHowItWorksCard>
          <MarketingHowItWorksRow>
            <MarketingHowItWorksStepBody step={1}>
              <Heading3 as="h3">{UPDATE_STEPS[0].title}</Heading3>
              <Text size="sm" tone="muted">{UPDATE_STEPS[0].body}</Text>
            </MarketingHowItWorksStepBody>
            <MarketingHowItWorksStepIllustration align="right">
              <HowItWorksConnect />
            </MarketingHowItWorksStepIllustration>
          </MarketingHowItWorksRow>

          <MarketingHowItWorksRow reverse>
            <MarketingHowItWorksStepBody step={2}>
              <Heading3 as="h3">{UPDATE_STEPS[1].title}</Heading3>
              <Text size="sm" tone="muted">{UPDATE_STEPS[1].body}</Text>
            </MarketingHowItWorksStepBody>
            <MarketingHowItWorksStepIllustration align="left">
              <HowItWorksConfigure />
            </MarketingHowItWorksStepIllustration>
          </MarketingHowItWorksRow>

          <MarketingHowItWorksRow>
            <MarketingHowItWorksStepBody step={3}>
              <Heading3 as="h3">{UPDATE_STEPS[2].title}</Heading3>
              <Text size="sm" tone="muted">{UPDATE_STEPS[2].body}</Text>
              <Text size="sm" tone="muted">{UPDATE_STEPS[2].note}</Text>
            </MarketingHowItWorksStepBody>
            <MarketingHowItWorksStepIllustration align="right">
              <HowItWorksSync />
            </MarketingHowItWorksStepIllustration>
          </MarketingHowItWorksRow>
        </MarketingHowItWorksCard>
      </MarketingHowItWorksSection>

      <MarketingCtaSection>
        <MarketingCtaCard>
          <Heading2 className="text-center text-white">Ready to sync your calendars?</Heading2>
          <Text size="sm" align="center" tone="highlight" className="max-w-[46ch]">
            Start syncing your calendars in seconds. Free to use, no credit card required.
          </Text>
          <div className="flex items-center gap-2 mt-2">
            <LinkButton
              to="/register"
              size="compact"
              variant="inverse"
              data-visitors-event={ANALYTICS_EVENTS.marketing_cta_clicked}
              data-visitors-cta="features"
            >
              <ButtonText>Get Started</ButtonText>
              <ButtonIcon>
                <ArrowRightIcon size={16} />
              </ButtonIcon>
            </LinkButton>
            <ExternalLinkButton
              href="https://github.com/ridafkih/keeper.sh"
              target="_blank"
              rel="noreferrer"
              size="compact"
              variant="inverse-ghost"
            >
              <ButtonText>View on GitHub</ButtonText>
              <ButtonIcon>
                <ArrowUpRightIcon size={16} />
              </ButtonIcon>
            </ExternalLinkButton>
          </div>
        </MarketingCtaCard>
      </MarketingCtaSection>
    </div>
  );
}
