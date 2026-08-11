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

const PATH = "/compare/reclaim-alternative";
const CHECKED_AT = "11 August 2026";

const PAGE_DESCRIPTION =
  "A sourced comparison of Keeper.sh and Reclaim.ai. Reclaim is an AI scheduling product that includes calendar sync; Keeper.sh only does the sync. This page covers when that swap makes sense and when it does not.";

const SOURCES: CompareSource[] = [
  {
    id: "reclaim-home",
    label: "Reclaim.ai homepage — product positioning, supported calendar accounts, task integrations, Dropbox branding.",
    url: "https://reclaim.ai",
    checkedAt: CHECKED_AT,
  },
  {
    id: "reclaim-pricing",
    label: "Reclaim.ai pricing — Lite, Starter, Business and Enterprise tiers, calendar sync limits, seat caps.",
    url: "https://reclaim.ai/pricing",
    checkedAt: CHECKED_AT,
  },
  {
    id: "reclaim-sync",
    label: "Reclaim.ai Calendar Sync feature page — real-time sync claim and the five event visibility settings.",
    url: "https://reclaim.ai/features/calendar-sync",
    checkedAt: CHECKED_AT,
  },
  {
    id: "reclaim-sync-help",
    label: "Reclaim.ai help centre — Calendar Sync is supported only for Google Calendar and Microsoft Outlook accounts.",
    url: "https://help.reclaim.ai/en/articles/3600762-calendar-sync-overview",
    checkedAt: CHECKED_AT,
  },
  {
    id: "reclaim-mcp",
    label: "Reclaim.ai Claude integration — hosted MCP server, per-tool permissions, preview mode for writes.",
    url: "https://reclaim.ai/integrations/claude",
    checkedAt: CHECKED_AT,
  },
  {
    id: "reclaim-dropbox",
    label: "Reclaim.ai announcement — acquisition by Dropbox, 20 August 2024.",
    url: "https://reclaim.ai/blog/dropbox-acquires-reclaim",
    checkedAt: CHECKED_AT,
  },
];

const ROWS: CompareRow[] = [
  {
    dimension: "What the product is",
    keeper: "A calendar sync service and an aggregated iCal feed. Nothing else.",
    rival: "An AI scheduling product covering task auto-scheduling, habits, focus time and scheduling links. Calendar sync is one feature within it.",
    sourceIds: ["reclaim-home"],
  },
  {
    dimension: "Calendars it can sync",
    keeper: "Google, Outlook, iCloud, Fastmail, any CalDAV server, and any ICS/iCal URL.",
    rival: "Calendar Sync is stated to be supported only for calendars connected to a Google Calendar or Microsoft Outlook account.",
    sourceIds: ["reclaim-sync-help"],
  },
  {
    dimension: "Sync latency",
    keeper: "Polling. Destinations are written every 30 minutes on Free and every minute on Pro.",
    rival: "Described as real time, with updates stated to happen instantly rather than on a timer.",
    sourceIds: ["reclaim-sync"],
  },
  {
    dimension: "Hiding detail",
    keeper: "Per-calendar toggles to strip title, description and location, plus a title template.",
    rival: "Five per-sync visibility settings, from full detail down to generic busy time, including options that reveal detail only to you or to people with access.",
    sourceIds: ["reclaim-sync"],
  },
  {
    dimension: "Free tier",
    keeper: "2 linked accounts, 3 sync mappings, 30-minute pushes, aggregated iCal feed, 25 API calls a day.",
    rival: "A free-forever Lite plan including one calendar sync, one scheduling link and a one-week scheduling range.",
    sourceIds: ["reclaim-pricing"],
  },
  {
    dimension: "Paid pricing",
    keeper: "Pro is $5 a month, unlimited accounts and unlimited mappings.",
    rival: "Starter $10 and Business $15 per seat per month, with Enterprise at $22 per seat, annual only. Starter includes three calendar syncs; Business and Enterprise state unlimited.",
    sourceIds: ["reclaim-pricing"],
  },
  {
    dimension: "Scheduling and task automation",
    keeper: "None. Keeper.sh will not schedule anything for you.",
    rival: "The core of the product, with integrations for Asana, ClickUp, Todoist, Jira, Linear and Google Tasks.",
    sourceIds: ["reclaim-home"],
  },
  {
    dimension: "MCP server",
    keeper: "Yes, 11 tools, OAuth 2.1, self-hostable as a separate image.",
    rival: "Yes, a hosted MCP server with per-tool permissions and a preview step before calendar writes.",
    sourceIds: ["reclaim-mcp"],
  },
  {
    dimension: "Team features",
    keeper: "None. Keeper.sh has no organisations, seats, shared configuration, SSO or SCIM.",
    rival: "Seat-based plans up to 100 seats, with SSO and SCIM on Enterprise.",
    sourceIds: ["reclaim-pricing"],
  },
  {
    dimension: "Ownership",
    keeper: "Independent, single-maintainer open-source project.",
    rival: "Acquired by Dropbox, announced 20 August 2024.",
    sourceIds: ["reclaim-dropbox", "reclaim-home"],
  },
  {
    dimension: "Source code and self-hosting",
    keeper: "AGPL-3.0 on GitHub. Self-hosted instances get every Pro feature with no licence key.",
    rival: "No source licence or self-hosting option is described on the pages we checked, in either direction.",
    sourceIds: ["reclaim-home", "reclaim-pricing"],
  },
];

const QUESTIONS: CompareQuestion[] = [
  {
    question: "Can Keeper.sh replace Reclaim.ai?",
    answer:
      "Only if calendar sync was the only part you used. Keeper.sh has no task auto-scheduling, no habits, no focus time defence and no scheduling links, and it is not going to grow them. If you rely on any of that, stay on Reclaim.",
  },
  {
    question: "Why would someone switch from Reclaim to Keeper.sh for sync?",
    answer:
      "Usually because one of the calendars is not Google or Outlook. Reclaim states that Calendar Sync only supports calendars connected to a Google or Microsoft Outlook account, while Keeper.sh also handles iCloud, Fastmail, generic CalDAV servers and plain ICS feed URLs.",
  },
  {
    question: "Is Reclaim's free plan enough for calendar sync?",
    answer:
      "It may well be. Reclaim's Lite plan is free forever and includes one calendar sync. If you only need one calendar mirrored into another and both are Google or Outlook, that is a real option and it syncs faster than Keeper.sh does. Keeper.sh's free tier allows three mappings across two accounts.",
  },
  {
    question: "Which one syncs faster?",
    answer:
      "Reclaim. It describes its sync as real time and explicitly not on a timer. Keeper.sh polls, on a one-minute cycle for Pro and a 30-minute cycle for free accounts.",
  },
];

export const Route = createFileRoute("/(marketing)/compare/reclaim-alternative")({
  component: ReclaimComparePage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
    meta: seoMeta({
      title: "Reclaim.ai Alternative for Calendar Sync",
      description: PAGE_DESCRIPTION,
      path: PATH,
    }),
    scripts: [
      jsonLdScript(webPageSchema("Keeper.sh vs Reclaim.ai", PAGE_DESCRIPTION, PATH)),
      jsonLdScript(
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: "Reclaim.ai alternative", path: PATH },
        ]),
      ),
      jsonLdScript(faqPageSchema(PATH, QUESTIONS)),
    ],
  }),
});

function ReclaimComparePage() {
  return (
    <ComparePageLayout>
      <ComparePageHeader
        eyebrow={`Compare · checked ${CHECKED_AT}`}
        title="Keeper.sh vs Reclaim.ai"
        summary="These are not the same kind of product. Reclaim.ai is an AI scheduling assistant that also syncs calendars; Keeper.sh only syncs calendars. This page compares the one thing they overlap on, so you can tell whether the overlap is all you needed."
      />

      <CompareSection title="Read this first">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            If you use Reclaim to auto-schedule tasks from Jira or Todoist, to defend focus time, to keep
            habits on the calendar, or to hand out scheduling links, Keeper.sh is not a replacement. It
            does none of those things and it is not planned to. Comparing the two on those grounds would
            be dishonest.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            The comparison is worth making on one axis only: keeping several calendars mirrored into each
            other. That is the whole of what Keeper.sh does, and it is one feature inside Reclaim.
          </Text>
        </CompareProse>
      </CompareSection>

      <CompareSection
        title="Feature by feature"
        description="Every claim in the Reclaim.ai column is taken from a Reclaim.ai page listed in the sources at the bottom of this page."
      >
        <CompareTable
          rivalName="Reclaim.ai"
          rows={ROWS}
          sources={SOURCES}
          caption="Keeper.sh and Reclaim.ai compared across product scope, supported calendars, sync latency, pricing, team features and licensing."
        />
      </CompareSection>

      <CompareSection title="Where each one wins">
        <CompareVerdictGrid>
          <CompareVerdictCard
            title="Pick Reclaim.ai"
            points={[
              "You want tasks from your tracker scheduled onto your calendar automatically.",
              "You want focus time, habits or scheduling links.",
              "You need seats, SSO or SCIM for a team.",
              "Both of your calendars are Google or Outlook and you want real-time sync on a free plan.",
            ]}
          />
          <CompareVerdictCard
            title="Pick Keeper.sh"
            points={[
              "A calendar you need to sync is iCloud, Fastmail, CalDAV or a plain ICS URL.",
              "You want several mappings between several accounts without moving up a seat-priced tier.",
              "You want the source code, and the option to self-host with every Pro feature included.",
              "You want one anonymised iCal feed aggregating everything you are busy with.",
              "You want a tool that only mirrors the events you already have, and adds none of its own.",
            ]}
          />
        </CompareVerdictGrid>
      </CompareSection>

      <CompareSection title="Where we lose, plainly">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            Reclaim's free Lite plan includes a calendar sync and syncs in real time. Keeper.sh's free
            plan pushes on a 30-minute cycle. For a single Google-to-Outlook mirror, Reclaim's free tier
            is the faster option and this page is not going to pretend otherwise.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Reclaim also has finer visibility controls per sync than Keeper.sh does, a company behind it
            since the Dropbox acquisition, and team infrastructure that Keeper.sh has none of. Keeper.sh
            is a single-maintainer project with no SSO, no seats, no shared configuration and no
            compliance certifications.
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
