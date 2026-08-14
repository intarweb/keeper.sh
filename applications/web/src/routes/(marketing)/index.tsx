import { useSetAtom } from 'jotai'
import { createFileRoute, useLoaderData, type LinkProps } from '@tanstack/react-router'
import { canonicalUrl, faqSchema, jsonLdScript, seoMeta, softwareApplicationSchema, webPageSchema } from '../../lib/seo'
import { Heading1, Heading2, Heading3 } from '../../components/ui/primitives/heading'
import { Text } from '../../components/ui/primitives/text'
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
import {
  MarketingTestimonialCard,
  MarketingTestimonialsGrid,
  MarketingTestimonialsSection,
} from '../../features/marketing/components/marketing-testimonials'
import { MarketingIllustrationContributors } from '../../illustrations/marketing-illustration-contributors'
import { MarketingIllustrationProviders } from '../../illustrations/marketing-illustration-providers'
import { MarketingIllustrationSync } from '../../illustrations/marketing-illustration-sync'
import {
  MarketingPricingComparisonGrid,
  MarketingPricingComparisonSpacer,
  MarketingPricingIntro,
  MarketingPricingPlanCard,
  MarketingPricingSection,
} from '../../features/marketing/components/marketing-pricing-section'
import { PRICING_PLANS } from '../../features/marketing/pricing-plans'
import { TESTIMONIALS } from '../../features/marketing/testimonials'
import { formatStarCount } from '../../features/marketing/github-stars'
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
  link?: { to: LinkProps["to"]; label: string }
}

const MARKETING_FEATURES: MarketingFeature[] = [
  {
    id: 1,
    title: 'Every calendar knows what the others are doing',
    description:
      'Book a dentist appointment in your personal calendar and the slot goes busy on your work one. Change the time and both change.',
    gridClassName: 'lg:col-start-1 lg:col-span-6 lg:row-start-1',
    illustration: <MarketingIllustrationSync />,
  },
  {
    id: 2,
    title: 'Works with the calendar you already use',
    description:
      'Sign in to Google, Outlook or iCloud and Keeper.sh is connected. If your calendar is somewhere else, paste a calendar link instead.',
    gridClassName: 'lg:col-start-7 lg:col-span-4 lg:row-start-1',
    illustration: <MarketingIllustrationProviders />,
  },
  {
    id: 3,
    title: 'Your colleagues see that you are busy, not why',
    description:
      'A copied event is titled after the calendar it came from. The description, the location and the guest list are left behind.',
    gridClassName: 'lg:col-start-1 lg:col-span-4 lg:row-start-2',
  },
  {
    id: 4,
    title: 'Anyone can read the code',
    description:
      'Keeper.sh is open source, so you can check for yourself what it sends to your calendars. Or run it on a server of your own.',
    gridClassName: 'lg:col-start-5 lg:col-span-6 lg:row-start-2',
    illustration: <MarketingIllustrationContributors />,
    link: { to: '/about', label: 'Who builds Keeper.sh, and why AGPL-3.0' },
  },
]

type FaqItem = {
  question: string
  answer: string
  content?: React.ReactNode
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'My calendar only gives me a link, not a login. Does that work?',
    answer:
      'Yes. Paste the link and Keeper.sh will copy those events onto your other calendars. It works one way only: you will see the events, but nothing you change in Keeper.sh reaches the original calendar.',
  },
  {
    question: 'Which calendars does Keeper.sh work with?',
    answer:
      'Keeper.sh works with Google Calendar, Microsoft Outlook, Apple iCloud and Fastmail. Beyond those, most calendars work too — if yours can give you a calendar link, or a username and password for a calendar app, you are covered.',
  },
  {
    question: 'Can my colleagues see what my personal events are?',
    answer:
      'No. By default the copy is titled after the calendar it came from, with no description, location or guest list. On Pro you can give it a title of your own — "Personal", say — and your colleagues see only that.',
  },
  {
    question: 'How often do calendars update?',
    answer:
      'Keeper.sh reads your calendars every minute on both plans. Changes reach your other calendars every 30 minutes on Free, and every minute on Pro. If people book you through a scheduling link, pay for the faster one.',
  },
  {
    question: 'Can I run Keeper.sh myself?',
    answer:
      'Yes. Keeper.sh is open source under the AGPL-3.0 license, and the README on GitHub has the setup steps. You will need a server, a domain, and the patience to keep both updated and backed up.',
    content: <>Yes. Keeper.sh is open source under the AGPL-3.0 license, and the <a href="https://github.com/ridafkih/keeper.sh#readme" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">README on GitHub</a> has the setup steps. You will need a server, a domain, and the patience to keep both updated and backed up.</>,
  },
  {
    question: 'Can I cancel any time?',
    answer:
      'Yes. Cancel from your account settings, and your access continues until the end of the period you have paid for.',
  },
]

export const Route = createFileRoute('/(marketing)/')({
  component: MarketingPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
    meta: seoMeta({
      title: "Sync Google Calendar with Outlook & iCloud",
      description: PAGE_DESCRIPTION,
      path: "/",
    }),
    scripts: [
      jsonLdScript(webPageSchema("Keeper.sh", PAGE_DESCRIPTION, "/")),
      jsonLdScript(softwareApplicationSchema()),
      jsonLdScript(faqSchema("", FAQ_ITEMS)),
    ],
  }),
})

function MarketingPage() {
  const setEmphasized = useSetAtom(calendarEmphasizedAtom)
  const githubStars = useLoaderData({ from: '/(marketing)' })

  const githubLabel =
    typeof githubStars.count === 'number'
      ? `GitHub · ${formatStarCount(githubStars.count)}`
      : 'GitHub'

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
                    {feature.link && (
                      <TextLink align="left" size="sm" to={feature.link.to} tone="muted">
                        {feature.link.label}
                      </TextLink>
                    )}
                  </MarketingFeatureBentoBody>
                </MarketingFeatureBentoCard>
              ))}
            </MarketingFeatureBentoGrid>
          </MarketingFeatureBentoSection>

          {TESTIMONIALS.length > 0 && (
            <MarketingTestimonialsSection id="testimonials">
              <Heading2 className="text-center">What people say</Heading2>
              <MarketingTestimonialsGrid>
                {TESTIMONIALS.map((testimonial) => (
                  <MarketingTestimonialCard key={`${testimonial.source}-${testimonial.author}`} {...testimonial} />
                ))}
              </MarketingTestimonialsGrid>
            </MarketingTestimonialsSection>
          )}

          <MarketingPricingSection id="pricing">
            <MarketingPricingIntro>
              <Heading2 className="text-center">Pricing</Heading2>
              <Text size='sm' align="center">
                Free covers two calendar accounts and three connections between them, updating every 30 minutes. That is fine for blocking out your evenings, too slow if people book you through a scheduling link. Pro is $5 a month for unlimited connections and updates every minute.
              </Text>
              <TextLink to="/pricing" size="sm" tone="muted">
                Compare Free and Pro in full
              </TextLink>
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
            </MarketingPricingComparisonGrid>
          </MarketingPricingSection>

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
                  <ButtonText>{githubLabel}</ButtonText>
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
