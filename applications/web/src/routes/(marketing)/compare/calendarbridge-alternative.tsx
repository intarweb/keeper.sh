import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@/components/ui/primitives/text";
import { ButtonIcon, ButtonText, ExternalLinkButton, LinkButton } from "@/components/ui/primitives/button";
import {
  CompareProse,
  CompareSection,
  CompareSourceList,
  CompareTable,
  CompareVerdictCard,
  CompareVerdictGrid,
  ComparePageHeader,
  ComparePageLayout,
} from "@/features/compare/components/compare-page";
import type { CompareQuestion, CompareRow, CompareSource } from "@/lib/compare";
import {
  breadcrumbSchema,
  canonicalUrl,
  faqPageSchema,
  jsonLdScript,
  seoMeta,
  webPageSchema,
} from "@/lib/seo";
import ArrowRightIcon from "lucide-react/dist/esm/icons/arrow-right";
import ArrowUpRightIcon from "lucide-react/dist/esm/icons/arrow-up-right";

const PATH = "/compare/calendarbridge-alternative";
const CHECKED_AT = "11 August 2026";

const PAGE_DESCRIPTION =
  "A sourced comparison of Keeper.sh and CalendarBridge for calendar sync, covering providers, sync latency, privacy controls, pricing and the features CalendarBridge has that Keeper.sh does not.";

const SOURCES: CompareSource[] = [
  {
    id: "cb-home",
    label: "CalendarBridge homepage — providers, sync description, scheduling links, busy-only privacy, trial wording.",
    url: "https://calendarbridge.com",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-pricing",
    label: "CalendarBridge pricing — Basic, Premium and Pro tiers, calendar counts, scheduling pages, HIPAA availability.",
    url: "https://calendarbridge.com/pricing",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-group-pricing",
    label: "CalendarBridge group pricing — per-user licences and separately billed sync licences.",
    url: "https://calendarbridge.com/pricing-group/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-accounts",
    label: "CalendarBridge docs — the exact account types you can connect, including Microsoft 365 GCC High and ICS URLs.",
    url: "https://help.calendarbridge.com/user-docs/connecting-calendar-accounts/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-frequency",
    label: "CalendarBridge FAQ — real-time push sync for Google and Outlook, 5 to 10 minutes for iCloud and internet calendars.",
    url: "https://help.calendarbridge.com/faq/how-often-do-calendars-sync/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-manage-syncs",
    label: "CalendarBridge docs — the six copyable event fields and the All Private toggle.",
    url: "https://help.calendarbridge.com/help/manage-syncs.html",
    checkedAt: CHECKED_AT,
  },
  {
    id: "cb-unified",
    label: "CalendarBridge unified calendar — combined view across providers, web and mobile apps.",
    url: "https://calendarbridge.com/unified-calendar/",
    checkedAt: CHECKED_AT,
  },
];

const ROWS: CompareRow[] = [
  {
    dimension: "Sources it reads",
    keeper: "Google, Outlook, iCloud, Fastmail, any CalDAV server, and any ICS/iCal URL.",
    rival: "Google Calendar, Microsoft 365 for Business, Microsoft personal accounts, Microsoft 365 GCC High, iCloud, and ICS URLs. Generic CalDAV is not listed as an account type.",
    sourceIds: ["cb-accounts"],
  },
  {
    dimension: "Sync latency",
    keeper: "Polling throughout. Sources are read every minute; destinations are written every 30 minutes on Free and every minute on Pro.",
    rival: "Push-based and described as real-time for Google and Outlook, stated as usually within a minute. iCloud and internet ICS calendars are stated to sync every 5 to 10 minutes.",
    sourceIds: ["cb-frequency"],
  },
  {
    dimension: "Event detail copied",
    keeper: "Title, description, location, times, timezone and recurrence. Attendees, organisers, conference links and reminders are never copied.",
    rival: "Per-field toggles for subject, attendees, description, location, conference link and reminders, with time and date always synced.",
    sourceIds: ["cb-manage-syncs"],
  },
  {
    dimension: "Hiding detail",
    keeper: "Per-calendar toggles to strip title, description and location, plus a title template. Synced events are not marked private on the destination.",
    rival: "A free/busy-only mode that writes events titled Busy, and an All Private toggle that marks every synced event private on the destination.",
    sourceIds: ["cb-home", "cb-manage-syncs"],
  },
  {
    dimension: "Unified calendar view",
    keeper: "No combined calendar UI. Keeper.sh publishes one aggregated iCal feed you subscribe to from your own client.",
    rival: "A unified calendar product across Google, Microsoft, iCloud and ICS, with web and mobile apps.",
    sourceIds: ["cb-unified"],
  },
  {
    dimension: "Booking and scheduling links",
    keeper: "None.",
    rival: "Scheduling pages are part of the product, with up to 10 pages on every tier.",
    sourceIds: ["cb-home", "cb-pricing"],
  },
  {
    dimension: "Free tier",
    keeper: "Permanent free tier: 2 linked accounts, 3 sync mappings, 30-minute pushes, aggregated iCal feed, 25 API calls a day.",
    rival: "A free trial with no credit card required. The pricing page lists three paid tiers; we found no permanent free tier.",
    sourceIds: ["cb-home", "cb-pricing"],
  },
  {
    dimension: "Paid pricing",
    keeper: "Pro is $5 a month or $42 a year, one tier, unlimited accounts and mappings.",
    rival: "Basic $5, Premium $10 and Pro $40 a month, capped at 2, 5 and 8 calendars respectively, with a 20% annual discount. Group plans bill sync connections separately at $4 a month each.",
    sourceIds: ["cb-pricing", "cb-group-pricing"],
  },
  {
    dimension: "Compliance",
    keeper: "No compliance certifications or programmes are offered.",
    rival: "HIPAA compliance is stated to be available on the Premium and Pro plans.",
    sourceIds: ["cb-pricing"],
  },
  {
    dimension: "API and MCP",
    keeper: "REST API under /api/v1 on both tiers, and an MCP server with 11 tools over OAuth 2.1.",
    rival: "Neither a public API nor an MCP server is described on the CalendarBridge pages we checked.",
    sourceIds: ["cb-home", "cb-unified"],
  },
  {
    dimension: "Source code and self-hosting",
    keeper: "AGPL-3.0 on GitHub. Self-hosted instances get every Pro feature with no licence key.",
    rival: "No source licence or self-hosting option is described on the pages we checked, in either direction.",
    sourceIds: ["cb-home", "cb-pricing"],
  },
];

const QUESTIONS: CompareQuestion[] = [
  {
    question: "Is Keeper.sh a CalendarBridge alternative?",
    answer:
      "For the sync half of CalendarBridge, yes. For the scheduling pages, the unified calendar apps, and HIPAA-covered use, no. Keeper.sh only does calendar-to-calendar syncing and an aggregated iCal feed.",
  },
  {
    question: "Which one syncs faster?",
    answer:
      "CalendarBridge, for Google and Outlook. It uses provider push notifications and describes sync as real time, usually within a minute. Keeper.sh polls, so a change reaches the destination calendar within about a minute on Pro and within about half an hour on the free plan.",
  },
  {
    question: "Does Keeper.sh work with CalDAV servers?",
    answer:
      "Yes. Any CalDAV server works as both a source and a destination, including self-hosted ones. CalendarBridge's documentation lists Google, Microsoft, iCloud and ICS URLs as the account types you can connect, and does not list generic CalDAV.",
  },
  {
    question: "How does pricing compare if I have a lot of calendars?",
    answer:
      "Keeper.sh Pro is a flat $5 a month with unlimited linked accounts and unlimited sync mappings. CalendarBridge's individual tiers are capped at 2, 5 and 8 calendars at $5, $10 and $40 a month, and group plans bill each sync connection separately.",
  },
];

export const Route = createFileRoute("/(marketing)/compare/calendarbridge-alternative")({
  component: CalendarBridgeComparePage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
    meta: seoMeta({
      title: "CalendarBridge Alternative — Keeper.sh vs CalendarBridge",
      description: PAGE_DESCRIPTION,
      path: PATH,
    }),
    scripts: [
      jsonLdScript(webPageSchema("Keeper.sh vs CalendarBridge", PAGE_DESCRIPTION, PATH)),
      jsonLdScript(
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: "CalendarBridge alternative", path: PATH },
        ]),
      ),
      jsonLdScript(faqPageSchema(PATH, QUESTIONS)),
    ],
  }),
});

function CalendarBridgeComparePage() {
  return (
    <ComparePageLayout>
      <ComparePageHeader
        eyebrow={`Compare · checked ${CHECKED_AT}`}
        title="Keeper.sh vs CalendarBridge"
        summary="CalendarBridge is a calendar suite: sync, a unified calendar across accounts, and scheduling pages, with a Microsoft-heavy provider list that reaches as far as Microsoft 365 GCC High. Keeper.sh is only the sync layer, but it reads more kinds of calendar and you can run it yourself."
      />

      <CompareSection title="The short version">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            CalendarBridge syncs faster and copies more. It uses provider push notifications for Google
            and Outlook and describes the result as real time, and it will carry attendees, conference
            links and reminders into the destination event. Keeper.sh polls and deliberately writes only
            a block of busy time.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Where Keeper.sh pulls ahead is reach and shape of the deal. Any CalDAV server counts as a
            first-class source and destination, there is a free tier you can sit on forever, Pro is one
            flat price with no calendar cap, and the whole thing is AGPL-3.0 if you would rather host it
            yourself.
          </Text>
        </CompareProse>
      </CompareSection>

      <CompareSection
        title="Feature by feature"
        description="Every claim in the CalendarBridge column is taken from a CalendarBridge page listed in the sources at the bottom of this page."
      >
        <CompareTable
          rivalName="CalendarBridge"
          rows={ROWS}
          sources={SOURCES}
          caption="Keeper.sh and CalendarBridge compared across providers, sync latency, event detail, pricing, compliance and licensing."
        />
      </CompareSection>

      <CompareSection title="Where each one wins">
        <CompareVerdictGrid>
          <CompareVerdictCard
            title="Pick CalendarBridge"
            points={[
              "You are on Microsoft 365 GCC High, which Keeper.sh does not target.",
              "You need HIPAA coverage, which Keeper.sh does not offer at all.",
              "You want attendees, conference links or reminders carried into the copy.",
              "You want synced events marked private on the destination calendar.",
              "You want scheduling pages and a unified calendar app from the same vendor.",
            ]}
          />
          <CompareVerdictCard
            title="Pick Keeper.sh"
            points={[
              "One of your calendars lives on a CalDAV server, self-hosted or otherwise.",
              "You want a free tier rather than a trial that ends.",
              "You have more than eight calendars and do not want to pay per calendar.",
              "You want the source code, and the option to run the whole service yourself.",
              "You want an API and an MCP server so agents can read your calendar.",
            ]}
          />
        </CompareVerdictGrid>
      </CompareSection>

      <CompareSection title="Where we lose, plainly">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            Latency is the honest gap. CalendarBridge subscribes to provider push notifications for
            Google and Outlook; Keeper.sh polls on a fixed cycle and has no webhook support at all. On the
            free plan that is up to half an hour between a change and the destination calendar catching
            up.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh has no HIPAA programme, no compliance certifications, and no unified calendar
            interface — the closest thing is an aggregated iCal feed you subscribe to from your own
            client. There is no mobile app and no scheduling product. And there is no way to mark a
            synced event as private on the destination; Keeper.sh strips detail at the source instead.
          </Text>
        </CompareProse>
      </CompareSection>

      <CompareSection title="Sources">
        <CompareSourceList sources={SOURCES} />
      </CompareSection>

      <div className="flex flex-wrap items-center gap-2">
        <LinkButton to="/register" size="compact">
          <ButtonText>Try Keeper.sh free</ButtonText>
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
          <ButtonText>Read the source</ButtonText>
          <ButtonIcon>
            <ArrowUpRightIcon size={16} />
          </ButtonIcon>
        </ExternalLinkButton>
      </div>
    </ComparePageLayout>
  );
}
