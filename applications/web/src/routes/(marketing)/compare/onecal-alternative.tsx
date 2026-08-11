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

const PATH = "/compare/onecal-alternative";
const CHECKED_AT = "11 August 2026";

const PAGE_DESCRIPTION =
  "A sourced comparison of Keeper.sh and OneCal for syncing events between calendar accounts, including the things OneCal does that Keeper.sh does not.";

const SOURCES: CompareSource[] = [
  {
    id: "onecal-home",
    label: "OneCal homepage — supported providers, real-time sync claim, iCloud delay, integrations.",
    url: "https://www.onecal.io/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-pricing",
    label: "OneCal pricing — Starter, Essential and Premium tiers, calendar limits, free trial.",
    url: "https://www.onecal.io/pricing",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-features",
    label: "OneCal features — per-field event copying, privacy options, event exclusions, mobile apps.",
    url: "https://www.onecal.io/features",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-scheduling",
    label: "OneCal scheduling links — one-on-one and collective booking links.",
    url: "https://www.onecal.io/scheduling-links",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-api",
    label: "OneCal Unified Calendar API — separate product and separate pricing.",
    url: "https://www.onecal.io/unified-calendar-api",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-mcp",
    label: "OneCal MCP server — connects Google, Outlook and iCloud calendars to MCP clients.",
    url: "https://www.onecal.io/integrations/calendar-mcp-server",
    checkedAt: CHECKED_AT,
  },
  {
    id: "onecal-docs-sync",
    label: "OneCal documentation — one-way and multi-way sync, real-time behaviour, proxy model.",
    url: "https://docs.onecal.io/docs/calendar-sync/calendar-sync-intro",
    checkedAt: CHECKED_AT,
  },
];

const ROWS: CompareRow[] = [
  {
    dimension: "Sources it reads",
    keeper: "Google, Outlook, iCloud, Fastmail, any CalDAV server, and any ICS/iCal URL. ICS is read-only.",
    rival: "Google Calendar, Microsoft Outlook Calendar, and Apple iCloud Calendar. We found no statement of generic CalDAV or ICS URL support.",
    sourceIds: ["onecal-home", "onecal-api"],
  },
  {
    dimension: "Sync latency",
    keeper: "Polling. Sources are read every minute; events are written to destinations every 30 minutes on Free and every minute on Pro. There are no provider webhooks.",
    rival: "Described as real-time and automatic, on every tier, with iCloud updates stated to take up to 10 minutes.",
    sourceIds: ["onecal-docs-sync", "onecal-home"],
  },
  {
    dimension: "Event detail copied",
    keeper: "Title, description, location, times, timezone and recurrence. Attendees, organisers and conference links are never copied.",
    rival: "Configurable per field, including titles, descriptions, participants, locations and conference links.",
    sourceIds: ["onecal-features"],
  },
  {
    dimension: "Hiding detail",
    keeper: "Per-calendar toggles to strip title, description and location, plus a title template that can render the calendar name or a fixed word.",
    rival: "Hide titles with a custom message, mark cloned events private, and exclude events by colour or RSVP status.",
    sourceIds: ["onecal-features"],
  },
  {
    dimension: "Booking and scheduling links",
    keeper: "None. Keeper.sh does not do scheduling.",
    rival: "One-on-one and collective scheduling links are part of the product.",
    sourceIds: ["onecal-scheduling"],
  },
  {
    dimension: "Mobile apps",
    keeper: "None. Web only.",
    rival: "iOS and Android apps are listed on the homepage.",
    sourceIds: ["onecal-home"],
  },
  {
    dimension: "Free tier",
    keeper: "Permanent free tier: 2 linked accounts, 3 sync mappings, 30-minute pushes, aggregated iCal feed, 25 API calls a day.",
    rival: "A 14-day free trial with no credit card. The pricing page lists three paid tiers; we found no permanent free tier.",
    sourceIds: ["onecal-pricing"],
  },
  {
    dimension: "Paid pricing",
    keeper: "Pro is $5 a month or $42 a year, single tier, unlimited accounts and mappings.",
    rival: "Starter $5, Essential $10 and Premium $25 per user per month billed annually, capped at 2, 5 and 50 calendars respectively with unlimited syncs.",
    sourceIds: ["onecal-pricing"],
  },
  {
    dimension: "API",
    keeper: "Read and event-CRUD REST API under /api/v1, included in both tiers, 25 calls a day on Free and uncapped on Pro. No OpenAPI spec.",
    rival: "A Unified Calendar API sold as a separate product with its own pricing, including a free non-production tier.",
    sourceIds: ["onecal-api"],
  },
  {
    dimension: "MCP server",
    keeper: "Yes, 11 tools, OAuth 2.1, self-hostable as a separate image.",
    rival: "Yes, a hosted MCP server with eight listed tools.",
    sourceIds: ["onecal-mcp"],
  },
  {
    dimension: "Source code and self-hosting",
    keeper: "AGPL-3.0 on GitHub. Self-hosted instances get every Pro feature with no licence key.",
    rival: "We found no statement about the source licence or self-hosting on OneCal's site, in either direction.",
    sourceIds: ["onecal-home", "onecal-pricing"],
  },
];

const QUESTIONS: CompareQuestion[] = [
  {
    question: "Is Keeper.sh a drop-in replacement for OneCal?",
    answer:
      "For calendar-to-calendar syncing, largely yes. For scheduling links, mobile apps, or copying attendees and conference links into the destination event, no. Keeper.sh does not have those.",
  },
  {
    question: "Does Keeper.sh sync in real time like OneCal?",
    answer:
      "No. Keeper.sh polls. Source calendars are read once a minute and changes are written to destination calendars every 30 minutes on the free plan or every minute on Pro. OneCal describes its sync as real-time.",
  },
  {
    question: "What does Keeper.sh support that OneCal does not?",
    answer:
      "Generic CalDAV servers, Fastmail, and arbitrary ICS or iCal feed URLs as sources, a permanent free tier, an aggregated iCal feed of your own calendars, and AGPL-3.0 source you can self-host with every Pro feature included.",
  },
  {
    question: "How much does each cost?",
    answer:
      "Keeper.sh Pro is $5 a month or $42 a year with unlimited accounts and mappings, on top of a permanent free tier. OneCal's published tiers are $5, $10 and $25 per user per month billed annually, limited to 2, 5 and 50 calendars, after a 14-day trial.",
  },
];

export const Route = createFileRoute("/(marketing)/compare/onecal-alternative")({
  component: OneCalComparePage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
    meta: seoMeta({
      title: "OneCal Alternative — Keeper.sh vs OneCal",
      description: PAGE_DESCRIPTION,
      path: PATH,
    }),
    scripts: [
      jsonLdScript(webPageSchema("Keeper.sh vs OneCal", PAGE_DESCRIPTION, PATH)),
      jsonLdScript(
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: "OneCal alternative", path: PATH },
        ]),
      ),
      jsonLdScript(faqPageSchema(PATH, QUESTIONS)),
    ],
  }),
});

function OneCalComparePage() {
  return (
    <ComparePageLayout>
      <ComparePageHeader
        eyebrow={`Compare · checked ${CHECKED_AT}`}
        title="Keeper.sh vs OneCal"
        summary="OneCal and Keeper.sh solve the same core problem: you have several calendar accounts and you want events from one to block time on another. They diverge on how much of the surrounding product exists, and on whether you can read and run the code yourself."
      />

      <CompareSection title="The short version">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            OneCal is the more complete commercial product. It syncs in real time, copies participants
            and conference links, ships scheduling links and mobile apps, and integrates with Zapier.
            If any of that is on your list, Keeper.sh will disappoint you, because none of it exists here.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh is narrower on purpose. It reads more kinds of calendar, including any CalDAV
            server and any ICS URL, it has a permanent free tier rather than a trial, and it is AGPL-3.0
            source you can run on your own machine with every paid feature turned on. The trade you are
            making is latency and product surface for reach, price, and control.
          </Text>
        </CompareProse>
      </CompareSection>

      <CompareSection
        title="Feature by feature"
        description="Every claim in the OneCal column is taken from a OneCal page listed in the sources at the bottom of this page."
      >
        <CompareTable
          rivalName="OneCal"
          rows={ROWS}
          sources={SOURCES}
          caption="Keeper.sh and OneCal compared across sources, sync latency, event detail, pricing and licensing."
        />
      </CompareSection>

      <CompareSection title="Where each one wins">
        <CompareVerdictGrid>
          <CompareVerdictCard
            title="Pick OneCal"
            points={[
              "You need changes to land on the other calendar within seconds rather than minutes.",
              "You want attendees, locations or conference links carried into the copy.",
              "You want scheduling links and calendar sync from one vendor.",
              "You want native iOS and Android apps.",
              "You want a Zapier connector.",
            ]}
          />
          <CompareVerdictCard
            title="Pick Keeper.sh"
            points={[
              "One of your calendars is Fastmail, a self-hosted CalDAV server, or a plain ICS feed.",
              "You want a free tier you can stay on indefinitely rather than a 14-day trial.",
              "You want to read the source, audit it, or run it yourself under AGPL-3.0.",
              "You want one aggregated, anonymised iCal feed of everything you are busy with.",
              "You are syncing many calendars and would rather not pay per calendar.",
            ]}
          />
        </CompareVerdictGrid>
      </CompareSection>

      <CompareSection title="Where we lose, plainly">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh has no push notifications from calendar providers. It polls, so on the free plan a
            change can sit for up to half an hour before it reaches the destination calendar, and even on
            Pro it is a one-minute cycle rather than an event-driven one. OneCal describes its sync as
            real time.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh also never writes attendees, organisers or conference links into a destination
            event. That is deliberate — the destination event is a block of busy time, not a copy of the
            meeting — but if you wanted the Zoom link to follow the event, Keeper.sh will not do it and
            OneCal states that it will.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            There is no Keeper.sh mobile app, no scheduling product, and no OpenAPI specification for the
            API. Documentation is a section of the README rather than a docs site.
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
