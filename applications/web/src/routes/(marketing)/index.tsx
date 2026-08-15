import { useSetAtom } from 'jotai'
import { createFileRoute } from '@tanstack/react-router'
import { faqSchema, jsonLdScript, seoHead, softwareApplicationSchema } from '../../lib/seo'
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
import { TextLink } from '../../components/ui/primitives/text-link'
import { ButtonIcon, ButtonText, ExternalLinkButton, LinkButton } from '../../components/ui/primitives/button'
import { MarketingIllustrationCalendar, MarketingIllustrationCalendarCard, type Skew, type SkewTuple } from '../../features/marketing/components/marketing-illustration-calendar'
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
import { PRICING_FEATURES, PRICING_PLANS, pricingPlanFeatures } from '../../features/marketing/pricing-plans'
import { calendarEmphasizedAtom } from '../../state/calendar-emphasized'
import { ANALYTICS_EVENTS } from '../../lib/analytics'
import ArrowRightIcon from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRightIcon from "lucide-react/dist/esm/icons/arrow-up-right";

const PAGE_DESCRIPTION =
  "Keeper.sh copies your events between Google Calendar, Outlook, iCloud and Fastmail so all of them show you as busy at the same times. Event titles stay private."

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
    title: 'One booking blocks every calendar',
    description:
      'Book something in one calendar and that time shows as busy in all the others.',
    gridClassName: 'lg:col-start-1 lg:col-span-6 lg:row-start-1',
    illustration: <MarketingIllustrationSync />,
  },
  {
    id: 2,
    title: 'Works with the calendars you already use',
    description:
      'Google, Outlook, iCloud and Fastmail sign in directly. For anything else, paste a calendar link.',
    gridClassName: 'lg:col-start-7 lg:col-span-4 lg:row-start-1',
    illustration: <MarketingIllustrationProviders />,
  },
  {
    id: 3,
    title: 'Synced events stay private by default',
    description:
      'A copy carries the calendar name in place of your event title. No description, location or guest list.',
    gridClassName: 'lg:col-start-1 lg:col-span-10 lg:row-start-2',
  },
  {
    id: 4,
    title: 'Let AI agents view and manage your calendar',
    description:
      'Connect Claude or any MCP client and let it check your week, book events and reschedule.',
    gridClassName: 'lg:col-start-1 lg:col-span-4 lg:row-start-3',
  },
  {
    id: 5,
    title: 'Anyone can read the code',
    description:
      'Check exactly what Keeper.sh sends to your calendars, or run it on your own server.',
    gridClassName: 'lg:col-start-5 lg:col-span-6 lg:row-start-3',
    illustration: <MarketingIllustrationContributors />,
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
      'Sign in with Google, Outlook, iCloud or Fastmail. For anything else, paste a calendar link.',
  },
  {
    title: 'Say where your events should land',
    description:
      'Point each calendar at the one you want its events copied into, and choose how much detail travels.',
  },
  {
    title: 'Keeper.sh takes it from there',
    description:
      'Your calendars are read every minute. Changes reach the others every 30 minutes on Free, and every minute on Pro.',
  },
]

type FaqItem = {
  question: string
  answer: string
  content?: React.ReactNode
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'My calendar only gives me a link to paste. Does that work?',
    answer:
      'Yes. Paste the link and those events copy to your other calendars. Copying goes one way, so nothing you change reaches the original calendar.',
  },
  {
    question: 'Which calendars does Keeper.sh work with?',
    answer:
      'Google Calendar, Outlook, iCloud and Fastmail sign in directly. Most others work too, as long as yours gives you a calendar link or a CalDAV login.',
  },
  {
    question: 'Can my colleagues see what my personal events are?',
    answer:
      'No. A copy carries the calendar name in place of your event title, and leaves the description and location behind. Guest lists are never copied on any plan, and the rest you can turn back on per calendar whenever you want.',
  },
  {
    question: 'How often do calendars update?',
    answer:
      'Keeper.sh reads every calendar every minute on both plans. Your changes reach the other calendars every 30 minutes on Free, and every minute on Pro.',
  },
  {
    question: 'Can I run Keeper.sh myself?',
    answer:
      'Yes. Keeper.sh is open source under AGPL-3.0, and the README on GitHub has the Docker setup steps. Every account on a server you run gets the Pro feature set, with no plan limits.',
    content: <>Yes. Keeper.sh is open source under AGPL-3.0, and the <a href="https://github.com/ridafkih/keeper.sh#readme" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">README on GitHub</a> has the Docker setup steps. Every account on a server you run gets the Pro feature set, with no plan limits.</>,
  },
  {
    question: 'Can I cancel any time?',
    answer:
      'Yes. Cancel in your account settings and keep access until the period you paid for ends.',
  },
]

export const Route = createFileRoute('/(marketing)/')({
  component: MarketingPage,
  head: () => seoHead({
    title: "Sync Google Calendar with Outlook & iCloud",
    description: PAGE_DESCRIPTION,
    path: "/",
    brandPosition: "before",
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
      <Heading1 className="text-center">Stop double-booking yourself.</Heading1>
      <Text align="center" className="max-w-[48ch] mx-auto">
        Keeper.sh copies your events between your personal, work and school calendars, so all of them show you as busy at the same times. Works with Google Calendar, Outlook, iCloud and Fastmail.
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
              <Heading2 className="text-center">Pricing</Heading2>
              <Text size="sm" align="center" tone="muted">
                Not sure which you need?{' '}
                <TextLink to="/pricing" size="sm" tone="default">See what each plan includes</TextLink>.
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
                  features={pricingPlanFeatures(plan.id)}
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
              Three steps, and then you can forget about it.
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
              Anything else, write to{' '}
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
                Free for two calendar accounts. No credit card.
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
