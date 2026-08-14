import { useSetAtom } from 'jotai'
import { createFileRoute } from '@tanstack/react-router'
import { canonicalUrl, faqSchema, jsonLdScript, seoMeta, softwareApplicationSchema } from '../../lib/seo'
import { Heading1, Heading2, Heading3 } from '../../components/ui/primitives/heading'
import { Text } from '../../components/ui/primitives/text'
import {
  MarketingHowItWorksSection,
  MarketingHowItWorksCard,
  MarketingHowItWorksRow,
  MarketingHowItWorksStepBody,
  MarketingHowItWorksStepIllustration,
} from '../../features/marketing/components/marketing-how-it-works'
import { MarketingFaqSection, MarketingFaqList, MarketingFaqItem, MarketingFaqQuestion } from '../../features/marketing/components/marketing-faq'
import { MarketingCtaSection, MarketingCtaCard } from '../../features/marketing/components/marketing-cta'
import { Collapsible } from '../../components/ui/primitives/collapsible'
import { ButtonIcon, ButtonText, ExternalLinkButton, LinkButton } from '../../components/ui/primitives/button'
import { MarketingIllustrationCalendar, MarketingIllustrationCalendarCard, type Skew, type SkewTuple } from '../../features/marketing/components/marketing-illustration-calendar'
import { MarketingHeroScreenshot } from '../../features/marketing/components/marketing-hero-screenshot'
import {
  MarketingFeatureBentoBody,
  MarketingFeatureBentoCard,
  MarketingFeatureBentoGrid,
  MarketingFeatureBentoIllustration,
  MarketingFeatureBentoSection,
} from '../../features/marketing/components/marketing-feature-bento'
import { MarketingIllustrationContributors } from '../../illustrations/marketing-illustration-contributors'
import { MarketingIllustrationProviders } from '../../illustrations/marketing-illustration-providers'
import { MarketingIllustrationSync } from '../../illustrations/marketing-illustration-sync'
import { MarketingIllustrationSetup } from '../../illustrations/marketing-illustration-setup'
import { HowItWorksConnect } from '../../illustrations/how-it-works-connect'
import { HowItWorksConfigure } from '../../illustrations/how-it-works-configure'
import { HowItWorksSync } from '../../illustrations/how-it-works-sync'
import {
  MarketingPricingComparisonGrid,
  MarketingPricingComparisonSpacer,
  MarketingPricingFeatureDisplay,
  MarketingPricingFeatureLabel,
  MarketingPricingFeatureMatrix,
  MarketingPricingFeatureRow,
  MarketingPricingFeatureValue,
  MarketingPricingIntro,
  MarketingPricingPlanCard,
  MarketingPricingSection,
} from '../../features/marketing/components/marketing-pricing-section'
import { PRICING_FEATURES, PRICING_PLANS } from '../../features/marketing/pricing-plans'
import { calendarEmphasizedAtom } from '../../state/calendar-emphasized'
import { ANALYTICS_EVENTS } from '../../lib/analytics'
import ArrowRightIcon from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRightIcon from "lucide-react/dist/esm/icons/arrow-up-right";

const createSkew = (rotate: number, x: number, y: number): Skew => ({ rotate, x, y });

const SKEW_BACK_LEFT: SkewTuple = [
  createSkew(-12, -24, 12),
  createSkew(-8, -16, 8),
  createSkew(-3, -8, 4),
]

const SKEW_BACK_RIGHT: SkewTuple = [
  createSkew(9, 20, -8),
  createSkew(5, 12, -4),
  createSkew(1.5, 6, -2),
]

const SKEW_FRONT: SkewTuple = [
  createSkew(-4, 4, -6),
  createSkew(-2, 2, -2),
  createSkew(0, 0, 0),
]

type MarketingFeature = {
  id: number
  title: string
  description: string
  gridClassName: string
  illustration?: React.ReactNode
}

const MARKETING_FEATURES: MarketingFeature[] = [
  {
    id: 1,
    title: 'You can check what it does with your calendars',
    description:
      'Anyone can read the code that touches your calendars and see exactly what it sends where. Keeper.sh is open-source under an AGPL-3.0 license and community driven. Here are some of the latest contributors.',
    gridClassName: 'lg:col-start-1 lg:col-span-4 lg:row-start-1',
    illustration: <MarketingIllustrationContributors />,
  },
  {
    id: 2,
    title: 'Universal Calendar Sync',
    description:
      'Google Calendar, Outlook, Apple Calendar, and more. Automatically sync events between all your calendars no matter the provider.',
    gridClassName: 'lg:col-start-5 lg:col-span-6 lg:row-start-1',
    illustration: <MarketingIllustrationProviders />,
  },
  {
    id: 3,
    title: 'Your other calendars stay right on their own',
    description:
      'Move an event and its copies move. Delete it and the copies go too. Keeper.sh tracks every copy it makes and checks them on each run, so your other calendars get corrected instead of collecting duplicates.',
    gridClassName: 'lg:col-start-1 lg:col-span-6 lg:row-start-2',
    illustration: <MarketingIllustrationSync />,
  },
  {
    id: 4,
    title: 'Quick Setup',
    description:
      'Link your Google, Outlook, iCloud, or CalDAV accounts in seconds. On the hosted version there is nothing to configure. Sign in and go.',
    gridClassName: 'lg:col-start-7 lg:col-span-4 lg:row-start-2',
    illustration: <MarketingIllustrationSetup />,
  },
]

type HowItWorksStep = {
  title: string
  description: string
}

const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    title: 'Connect your calendars',
    description:
      'Link your Google, Outlook, iCloud, or CalDAV accounts using OAuth or ICS feeds. It takes seconds.',
  },
  {
    title: 'Configure sync rules',
    description:
      'Choose which calendars to sync and how events should appear. Keeper.sh handles the rest automatically.',
  },
  {
    title: 'Stay in sync',
    description:
      'Your events are copied out to the calendars you chose, on a schedule. If something has drifted out of step, Keeper.sh fixes it on the next run.',
  },
]

type FaqItem = {
  question: string
  answer: string
  content?: React.ReactNode
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Can I add a calendar that only gives me a link?',
    answer:
      'Yes. Paste any public calendar link — the kind ending in .ics — and Keeper.sh copies those events into your other calendars. That covers calendars you can only view and never edit, like a school timetable or a league schedule.',
  },
  {
    question: 'Which calendar providers does Keeper.sh support?',
    answer:
      'Keeper.sh works with Google Calendar, Microsoft Outlook, Apple iCloud, FastMail, and any provider that supports CalDAV or ICS feeds. If your calendar supports one of these, it should work with Keeper.sh.',
  },
  {
    question: 'Can I self-host Keeper.sh?',
    answer:
      'Yes. Keeper.sh is open-source under the AGPL-3.0 license. Check the README on GitHub for setup instructions, or use one of the many Docker images we offer for quick deployment.',
    content: <>Yes. Keeper.sh is open-source under the AGPL-3.0 license. Check the <a href="https://github.com/ridafkih/keeper.sh#readme" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">README on GitHub</a> for setup instructions, or use one of the many Docker images we offer for quick deployment.</>,
  },
  {
    question: 'How often do calendars sync?',
    answer:
      'Keeper.sh reads your calendars every minute on both plans. What differs is how often it writes those changes back out to your other calendars: every 30 minutes on the free plan, and every minute on Pro.',
  },
  {
    question: 'Are my event details visible to others?',
    answer:
      'Only if you want them to be. By default a copied event shows only the name of the calendar it came from, and its description and location are left behind. On Pro you set this per calendar, choosing which details come across and what the stand-in title reads.',
  },
  {
    question: 'Can I control how synced events appear?',
    answer:
      'Yes, on Pro. You set it on the calendar the events are copied from, so a work calendar can carry the title, description, and location while a shared one stays a plain block.',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer:
      'Yes. You can cancel at any time from your account settings. Your access continues until the end of the current billing period.',
  },
]

export const Route = createFileRoute('/(marketing)/')({
  component: MarketingPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
    meta: seoMeta({
      title: "Sync Google Calendar with Outlook & iCloud",
      description:
        "Keeper.sh syncs busy time across Google, Outlook, iCloud and Fastmail so you never double-book, without sharing event titles, locations or attendees.",
      path: "/",
    }),
    scripts: [
      jsonLdScript(softwareApplicationSchema()),
      jsonLdScript(faqSchema("", FAQ_ITEMS)),
    ],
  }),
})

function MarketingPage() {
  const setEmphasized = useSetAtom(calendarEmphasizedAtom)

  return (
    <div className="flex flex-col gap-2 pt-8">
      <Heading1 className="text-center">Every calendar knows when you're busy. None of them know why.</Heading1>
      <Text align="center" className="max-w-[48ch] mx-auto">
        Keeper.sh copies your events between your personal, work and school calendars, so all of them show you as busy at the same times. Copied events carry the name of the calendar they came from in place of the event title, and their description and location are left behind by default. Attendee lists are never copied at all, and the code is open source, so you can check what it sends for yourself.
      </Text>
      <div className="contents *:z-20">
        <div className="flex items-center gap-2 mx-auto pt-1">
          <LinkButton
            to="/register"
            size="compact"
            onMouseEnter={() => setEmphasized(true)}
            onMouseLeave={() => setEmphasized(false)}
            data-visitors-event={ANALYTICS_EVENTS.marketing_cta_clicked}
            data-visitors-cta="hero"
          >
            <ButtonText>Sync Calendars</ButtonText>
            <ButtonIcon>
              <ArrowRightIcon size={16} />
            </ButtonIcon>
          </LinkButton>
          <ExternalLinkButton
            href="https://github.com/ridafkih/keeper.sh"
            target="_blank"
            rel="noreferrer"
            size="compact"
            variant="border"
          >
            <ButtonText>View GitHub</ButtonText>
            <ButtonIcon>
              <ArrowUpRightIcon size={16} />
            </ButtonIcon>
          </ExternalLinkButton>
        </div>
      </div>
      <div className="contents *:z-20">
        <MarketingHeroScreenshot />
      </div>
      <div className="contents *:z-10">
        <div className="flex flex-col">
          <MarketingIllustrationCalendar>
            <MarketingIllustrationCalendarCard skew={SKEW_BACK_LEFT} />
            <MarketingIllustrationCalendarCard skew={SKEW_BACK_RIGHT} />
            <MarketingIllustrationCalendarCard skew={SKEW_FRONT} />
          </MarketingIllustrationCalendar>
          <MarketingFeatureBentoSection id="features">
            <MarketingFeatureBentoGrid>
              {MARKETING_FEATURES.map((feature) => (
                <MarketingFeatureBentoCard key={feature.id} className={feature.gridClassName}>
                  <MarketingFeatureBentoIllustration plain={!!feature.illustration}>
                    {feature.illustration}
                  </MarketingFeatureBentoIllustration>
                  <MarketingFeatureBentoBody>
                    <Heading3 as="h2">{feature.title}</Heading3>
                    <Text size="sm" className="text-left">
                      {feature.description}
                    </Text>
                  </MarketingFeatureBentoBody>
                </MarketingFeatureBentoCard>
              ))}
            </MarketingFeatureBentoGrid>
          </MarketingFeatureBentoSection>

          <MarketingPricingSection id="pricing">
            <MarketingPricingIntro>
              <Heading2 className="text-center">Hosted Pricing</Heading2>
              <Text size='sm' align="center">
                Start free with two calendar accounts and three connections. Pro is $5 a month, or $42 a year, for as many calendars as you want and changes reaching your other calendars every minute. Self-hosting is free and includes every Pro feature, if you are happy to run the server and keep it updated.
              </Text>
            </MarketingPricingIntro>

            <MarketingPricingComparisonGrid>
              <MarketingPricingComparisonSpacer />

              {PRICING_PLANS.map((plan) => (
                <MarketingPricingPlanCard
                  key={plan.id}
                  tone={plan.tone}
                  name={plan.name}
                  price={plan.price}
                  period={plan.period}
                  description={plan.description}
                  ctaLabel={plan.ctaLabel}
                />
              ))}

              <MarketingPricingFeatureMatrix>
                {PRICING_FEATURES.map((feature) => (
                  <MarketingPricingFeatureRow key={feature.label}>
                    <MarketingPricingFeatureLabel>
                      <Text size="sm" className="text-left text-nowrap">{feature.label}</Text>
                    </MarketingPricingFeatureLabel>
                    <MarketingPricingFeatureValue>
                      <MarketingPricingFeatureDisplay value={feature.free} tone="muted" />
                    </MarketingPricingFeatureValue>
                    <MarketingPricingFeatureValue>
                      <MarketingPricingFeatureDisplay value={feature.pro} tone="muted" />
                    </MarketingPricingFeatureValue>
                  </MarketingPricingFeatureRow>
                ))}
              </MarketingPricingFeatureMatrix>
            </MarketingPricingComparisonGrid>
          </MarketingPricingSection>

          <MarketingHowItWorksSection>
            <Heading2 className="text-center">How It Works</Heading2>
            <Text size="sm" align="center" className="mt-2 max-w-[48ch] mx-auto">
              Three steps to keep every calendar on the same page. Connect, configure, and forget about it.
            </Text>
            <MarketingHowItWorksCard>
              <MarketingHowItWorksRow>
                <MarketingHowItWorksStepBody step={1}>
                  <Heading3 as="h3">{HOW_IT_WORKS_STEPS[0].title}</Heading3>
                  <Text size="sm" tone="muted">{HOW_IT_WORKS_STEPS[0].description}</Text>
                </MarketingHowItWorksStepBody>
                <MarketingHowItWorksStepIllustration align="right">
                  <HowItWorksConnect />
                </MarketingHowItWorksStepIllustration>
              </MarketingHowItWorksRow>

              <MarketingHowItWorksRow reverse>
                <MarketingHowItWorksStepBody step={2}>
                  <Heading3 as="h3">{HOW_IT_WORKS_STEPS[1].title}</Heading3>
                  <Text size="sm" tone="muted">{HOW_IT_WORKS_STEPS[1].description}</Text>
                </MarketingHowItWorksStepBody>
                <MarketingHowItWorksStepIllustration align="left">
                  <HowItWorksConfigure />
                </MarketingHowItWorksStepIllustration>
              </MarketingHowItWorksRow>

              <MarketingHowItWorksRow>
                <MarketingHowItWorksStepBody step={3}>
                  <Heading3 as="h3">{HOW_IT_WORKS_STEPS[2].title}</Heading3>
                  <Text size="sm" tone="muted">{HOW_IT_WORKS_STEPS[2].description}</Text>
                </MarketingHowItWorksStepBody>
                <MarketingHowItWorksStepIllustration align="right">
                  <HowItWorksSync />
                </MarketingHowItWorksStepIllustration>
              </MarketingHowItWorksRow>
            </MarketingHowItWorksCard>
          </MarketingHowItWorksSection>

          <MarketingFaqSection>
            <Heading2 className="text-center">Frequently Asked Questions</Heading2>
            <Text size="sm" align="center" className="mt-2 max-w-[48ch] mx-auto">
              Everything you need to know about Keeper.sh. Can't find what you're looking for? Reach out at{' '}
              <a href="mailto:support@keeper.sh" className="text-foreground underline underline-offset-2">support@keeper.sh</a>.
            </Text>
            <MarketingFaqList>
              {FAQ_ITEMS.map((item) => (
                <MarketingFaqItem key={item.question}>
                  <Collapsible
                    trigger={<MarketingFaqQuestion>{item.question}</MarketingFaqQuestion>}
                  >
                    <Text size="sm" tone="muted">{item.content ?? item.answer}</Text>
                  </Collapsible>
                </MarketingFaqItem>
              ))}
            </MarketingFaqList>
          </MarketingFaqSection>

          <MarketingCtaSection>
            <MarketingCtaCard>
              <Heading2 className="text-center text-white">Ready to sync your calendars?</Heading2>
              <Text size="sm" align="center" tone="highlight" className="max-w-[46ch]">
                Start syncing your calendars in seconds. Free to use, no credit card required.
              </Text>
              <div className="flex items-center gap-2 mt-2">
                <LinkButton to="/register" size="compact" variant="inverse" data-visitors-event={ANALYTICS_EVENTS.marketing_cta_clicked} data-visitors-cta="bottom">
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
      </div>
    </div>
  )
}
