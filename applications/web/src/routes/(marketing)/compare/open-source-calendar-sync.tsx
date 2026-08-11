import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@/components/ui/primitives/text";
import { ButtonIcon, ButtonText, ExternalLinkButton, LinkButton } from "@/components/ui/primitives/button";
import {
  CompareProjectCard,
  CompareProjectList,
  CompareProse,
  CompareSection,
  CompareSourceList,
  CompareVerdictCard,
  CompareVerdictGrid,
  ComparePageHeader,
  ComparePageLayout,
} from "@/features/compare/components/compare-page";
import type { CompareQuestion, CompareSource } from "@/lib/compare";
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

const PATH = "/compare/open-source-calendar-sync";
const CHECKED_AT = "11 August 2026";

const PAGE_DESCRIPTION =
  "The self-hostable projects people reach for when they want calendars in sync, grouped by what they actually do, with licences and release dates taken from each project's own repository.";

const SOURCES: CompareSource[] = [
  {
    id: "keeper-repo",
    label: "Keeper.sh repository — AGPL-3.0 licence, Docker images, self-hosting instructions.",
    url: "https://github.com/ridafkih/keeper.sh",
    checkedAt: CHECKED_AT,
  },
  {
    id: "vdirsyncer",
    label: "vdirsyncer repository and configuration docs — BSD 3-Clause licence, storage pairs, google_calendar storage.",
    url: "https://vdirsyncer.pimutils.org/en/stable/config.html",
    checkedAt: CHECKED_AT,
  },
  {
    id: "vdirsyncer-repo",
    label: "vdirsyncer repository — latest tag v0.20.0, commit dated 28 August 2025.",
    url: "https://github.com/pimutils/vdirsyncer",
    checkedAt: CHECKED_AT,
  },
  {
    id: "n8n-license",
    label: "n8n LICENSE.md — Sustainable Use License v1.0, internal business purposes and non-commercial distribution.",
    url: "https://github.com/n8n-io/n8n/blob/master/LICENSE.md",
    checkedAt: CHECKED_AT,
  },
  {
    id: "n8n-nodes",
    label: "n8n documentation — Google Calendar node and Microsoft Outlook node with calendar and event operations.",
    url: "https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "n8n-pricing",
    label: "n8n Cloud pricing — Starter, Pro, Business and Enterprise tiers.",
    url: "https://n8n.io/pricing/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "activepieces",
    label: "Activepieces repository LICENSE — MIT with the packages/ee directories under a separate licence.",
    url: "https://github.com/activepieces/activepieces/blob/main/LICENSE",
    checkedAt: CHECKED_AT,
  },
  {
    id: "activepieces-pieces",
    label: "Activepieces Google Calendar and Microsoft Outlook Calendar pieces — available triggers and actions.",
    url: "https://www.activepieces.com/pieces/google-calendar",
    checkedAt: CHECKED_AT,
  },
  {
    id: "radicale",
    label: "Radicale — CalDAV and CardDAV server, GPLv3, release v3.7.8 on 6 August 2026.",
    url: "https://radicale.org/v3.html",
    checkedAt: CHECKED_AT,
  },
  {
    id: "baikal",
    label: "Baïkal — lightweight CalDAV and CardDAV server, GPL-3.0, release 0.12.1 on 5 August 2026.",
    url: "https://sabre.io/baikal/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "nextcloud-calendar",
    label: "Nextcloud Calendar documentation — read-only subscription from link, refreshed weekly.",
    url: "https://docs.nextcloud.com/server/latest/user_manual/en/groupware/calendar.html",
    checkedAt: CHECKED_AT,
  },
  {
    id: "nextcloud-repo",
    label: "Nextcloud Calendar repository — AGPL-3.0 licence, latest tag v6.6.0 dated 28 July 2026.",
    url: "https://github.com/nextcloud/calendar",
    checkedAt: CHECKED_AT,
  },
  {
    id: "davx5",
    label: "DAVx⁵ — all-in-one CalDAV, CardDAV and WebDAV solution for Android, GPL-3.0, release v4.5.19-ose on 3 August 2026.",
    url: "https://www.davx5.com/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "davx5-google",
    label: "DAVx⁵ documentation — Google accounts work over CalDAV with OAuth 2.0 and are not officially supported by either party.",
    url: "https://www.davx5.com/tested-with/google",
    checkedAt: CHECKED_AT,
  },
  {
    id: "etesync",
    label: "EteSync — end-to-end encrypted sync for contacts, calendars, tasks and notes, with a DAV bridge.",
    url: "https://www.etesync.com/",
    checkedAt: CHECKED_AT,
  },
  {
    id: "etesync-repo",
    label: "EteSync server repository — AGPL-3.0 licence, latest tag v0.14.2 with a commit dated 13 June 2024.",
    url: "https://github.com/etesync/server",
    checkedAt: CHECKED_AT,
  },
];

type Project = {
  name: string;
  href: string;
  summary: string;
  facts: Array<{ label: string; value: string }>;
  sourceIds: string[];
};

const MIRRORING_PROJECTS: Project[] = [
  {
    name: "Keeper.sh",
    href: "https://github.com/ridafkih/keeper.sh",
    summary:
      "A hosted and self-hostable service that reads events from calendar accounts and writes busy blocks into others. Five first-class providers plus generic CalDAV and ICS feed URLs.",
    facts: [
      { label: "Licence", value: "AGPL-3.0" },
      { label: "Mirrors between accounts", value: "Yes, this is the whole product" },
      { label: "Native provider APIs", value: "Google Calendar API and Microsoft Graph, both with incremental sync" },
      { label: "Runs as", value: "Docker images, Postgres and Redis, or the hosted service" },
      { label: "Self-hosted licensing", value: "Every Pro feature included, no licence key" },
      { label: "Sync model", value: "Polling. One minute in, 30 minutes or one minute out" },
    ],
    sourceIds: ["keeper-repo"],
  },
  {
    name: "vdirsyncer",
    href: "https://vdirsyncer.pimutils.org",
    summary:
      "A command-line tool that synchronises calendars and contacts between servers and the local filesystem. Configuration pairs two storages, so two remote accounts can be paired directly.",
    facts: [
      { label: "Licence", value: "BSD 3-Clause" },
      { label: "Mirrors between accounts", value: "Yes, by pairing two remote storages" },
      { label: "Native provider APIs", value: "A google_calendar storage with OAuth. Microsoft Graph is not documented" },
      { label: "Runs as", value: "A CLI you schedule yourself" },
      { label: "Hosted version", value: "None found" },
      { label: "Latest tag", value: "v0.20.0, commit dated 28 August 2025" },
    ],
    sourceIds: ["vdirsyncer", "vdirsyncer-repo"],
  },
  {
    name: "n8n",
    href: "https://n8n.io",
    summary:
      "A workflow automation platform. There is no calendar mirroring feature, but the Google Calendar and Microsoft Outlook nodes give you the event operations to build one yourself.",
    facts: [
      { label: "Licence", value: "Sustainable Use License v1.0, not an OSI licence" },
      { label: "Licence terms", value: "Internal business purposes only; redistribution must be free and non-commercial" },
      { label: "Mirrors between accounts", value: "Not out of the box. You build the workflow" },
      { label: "Native provider APIs", value: "Google Calendar API v3 and Microsoft Graph" },
      { label: "Runs as", value: "Self-hosted server or n8n Cloud" },
      { label: "Hosted version", value: "Starter €20, Pro €50, Business €667 a month billed annually" },
    ],
    sourceIds: ["n8n-license", "n8n-nodes", "n8n-pricing"],
  },
  {
    name: "Activepieces",
    href: "https://www.activepieces.com",
    summary:
      "A workflow automation platform in the same shape as n8n. Its Google Calendar piece has event triggers and actions; its Microsoft Outlook Calendar piece covers create, delete and list.",
    facts: [
      { label: "Licence", value: "MIT, with the packages/ee directories under a separate licence" },
      { label: "Mirrors between accounts", value: "Not out of the box. You build the flow" },
      { label: "Native provider APIs", value: "Google Calendar piece and Microsoft Outlook Calendar piece" },
      { label: "Runs as", value: "Self-hosted server or Activepieces Cloud" },
      { label: "Hosted version", value: "Free tier, Plus $16 and Team $166 a month billed yearly" },
      { label: "Latest release", value: "0.87.0 on 6 August 2026" },
    ],
    sourceIds: ["activepieces", "activepieces-pieces"],
  },
];

const SERVER_PROJECTS: Project[] = [
  {
    name: "Radicale",
    href: "https://radicale.org",
    summary:
      "A small CalDAV and CardDAV server. It gives you somewhere to keep your own calendars. It does not reach out to Google or Outlook and it does not sync between third-party accounts.",
    facts: [
      { label: "Licence", value: "GPLv3" },
      { label: "Mirrors between accounts", value: "No. It is a server, not a sync tool" },
      { label: "Protocols", value: "CalDAV, CardDAV and HTTP" },
      { label: "Runs as", value: "Python server, Docker image available" },
      { label: "Hosted version", value: "None found on the official site" },
      { label: "Latest release", value: "v3.7.8 on 6 August 2026" },
    ],
    sourceIds: ["radicale"],
  },
  {
    name: "Baïkal",
    href: "https://sabre.io/baikal/",
    summary:
      "A lightweight CalDAV and CardDAV server built on sabre/dav, with a web admin interface. Same role as Radicale: a place to host calendars, not a way to copy events between accounts.",
    facts: [
      { label: "Licence", value: "GPL-3.0" },
      { label: "Mirrors between accounts", value: "No. It is a server" },
      { label: "Protocols", value: "CalDAV and CardDAV" },
      { label: "Runs as", value: "PHP server with a web admin UI" },
      { label: "Hosted version", value: "None mentioned on the project page" },
      { label: "Latest release", value: "0.12.1 on 5 August 2026" },
    ],
    sourceIds: ["baikal"],
  },
  {
    name: "Nextcloud Calendar",
    href: "https://github.com/nextcloud/calendar",
    summary:
      "The calendar app for a Nextcloud server, on a CalDAV backend. External calendars can be added as read-only subscriptions from a link, which the documentation states are refreshed weekly.",
    facts: [
      { label: "Licence", value: "AGPL-3.0" },
      { label: "Mirrors between accounts", value: "No. External calendars are read-only subscriptions" },
      { label: "Native provider APIs", value: "CalDAV and iCal. No Google or Graph connector documented" },
      { label: "Runs as", value: "An app on a Nextcloud server" },
      { label: "Hosted version", value: "Nextcloud Enterprise from €71.29 per user per year, from 100 users" },
      { label: "Latest tag", value: "v6.6.0, tagged 28 July 2026" },
    ],
    sourceIds: ["nextcloud-calendar", "nextcloud-repo"],
  },
];

const CLIENT_PROJECTS: Project[] = [
  {
    name: "DAVx⁵",
    href: "https://www.davx5.com",
    summary:
      "An Android sync adapter for CalDAV, CardDAV and WebDAV. It gets a server's calendars onto an Android device. Its documented job is device to server, not server to server.",
    facts: [
      { label: "Licence", value: "GPL-3.0" },
      { label: "Mirrors between accounts", value: "Not documented. The core function is device to server sync" },
      { label: "Google", value: "Works over CalDAV with OAuth 2.0, stated as not officially supported by either party" },
      { label: "Runs as", value: "An Android app" },
      { label: "Cost", value: "Paid in the app stores, free on F-Droid and GitHub" },
      { label: "Latest release", value: "v4.5.19-ose on 3 August 2026" },
    ],
    sourceIds: ["davx5", "davx5-google"],
  },
  {
    name: "EteSync",
    href: "https://www.etesync.com",
    summary:
      "An end-to-end encrypted sync stack with its own server, clients and a DAV bridge. It syncs its own accounts across your devices rather than mirroring events between Google and Outlook.",
    facts: [
      { label: "Licence", value: "AGPL-3.0" },
      { label: "Mirrors between accounts", value: "No. It syncs its own encrypted accounts across devices" },
      { label: "Protocols", value: "Its own protocol, plus a DAV bridge for desktop clients" },
      { label: "Runs as", value: "Server, Android, iOS, web and a desktop DAV bridge" },
      { label: "Hosted version", value: "Personal $2 a month billed yearly, Supporter $4 a month" },
      { label: "Latest tag", value: "v0.14.2, commit dated 13 June 2024" },
    ],
    sourceIds: ["etesync", "etesync-repo"],
  },
];

const QUESTIONS: CompareQuestion[] = [
  {
    question: "What is the best open-source tool for syncing calendars between accounts?",
    answer:
      "It depends what you mean by syncing. If you want events from a work Google account to block time on a personal Outlook account, the tools that do that directly are Keeper.sh and vdirsyncer, or a workflow you build yourself in n8n or Activepieces. Radicale, Baïkal, Nextcloud and EteSync are places to host calendars, not tools for copying events between accounts.",
  },
  {
    question: "Is Radicale or Baïkal a calendar sync tool?",
    answer:
      "No. Both are CalDAV and CardDAV servers. They give you somewhere to keep calendars that you control. Neither connects to Google Calendar or Microsoft Graph and neither copies events between third-party accounts. They are often the right answer to a different question.",
  },
  {
    question: "Is n8n open source?",
    answer:
      "n8n is distributed under the Sustainable Use License version 1.0, which is not an OSI-approved open-source licence. Its terms limit use to your own internal business purposes and allow redistribution only free of charge for non-commercial purposes. The project describes itself as fair-code.",
  },
  {
    question: "Can I self-host Keeper.sh, and do I lose features?",
    answer:
      "Yes, under AGPL-3.0, with published Docker images. Self-hosted instances get every Pro feature with no licence key. You do lose passkey and social login, which are only enabled in commercial mode, and you are responsible for running Postgres and Redis.",
  },
];

export const Route = createFileRoute("/(marketing)/compare/open-source-calendar-sync")({
  component: OpenSourceRoundupPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
    meta: seoMeta({
      title: "Open-Source Calendar Sync Tools Compared",
      description: PAGE_DESCRIPTION,
      path: PATH,
    }),
    scripts: [
      jsonLdScript(webPageSchema("Open-source calendar sync tools", PAGE_DESCRIPTION, PATH)),
      jsonLdScript(
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
          { name: "Open-source calendar sync", path: PATH },
        ]),
      ),
      jsonLdScript(faqPageSchema(PATH, QUESTIONS)),
    ],
  }),
});

function OpenSourceRoundupPage() {
  return (
    <ComparePageLayout>
      <ComparePageHeader
        eyebrow={`Compare · checked ${CHECKED_AT}`}
        title="Open-source calendar sync tools"
        summary="Search for an open-source calendar sync tool and you get a list that mixes together three unrelated kinds of software. Most of what comes back is a CalDAV server or an Android client, neither of which will copy an event from your work calendar onto your personal one. This page sorts them by what they actually do."
      />

      <CompareSection title="The three categories">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            A tool that <strong className="text-foreground">mirrors events between accounts</strong> reads
            from one calendar account and writes into another. That is what you want if your problem is
            double bookings across a work and a personal calendar.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            A <strong className="text-foreground">CalDAV server</strong> is somewhere to keep calendars you
            control. It solves a different problem: getting off a provider, not reconciling two of them.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            A <strong className="text-foreground">client or device sync agent</strong> puts a server's
            calendars onto a phone or a desktop. Useful, but it is not going to copy events between two
            cloud accounts either.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh is in the first category, and this page is on Keeper.sh's own site, so read the rest
            with that in mind. Licences and release dates below come from each project's own repository or
            site, and are linked at the bottom.
          </Text>
        </CompareProse>
      </CompareSection>

      <CompareSection
        title="Mirrors events between accounts"
        description="These will move an event from one calendar account into another. Two do it as a product; two give you the parts to assemble one."
      >
        <CompareProjectList>
          {MIRRORING_PROJECTS.map((project) => (
            <CompareProjectCard key={project.name} {...project} sources={SOURCES} />
          ))}
        </CompareProjectList>
      </CompareSection>

      <CompareSection
        title="CalDAV servers you host yourself"
        description="These host your calendars. None of them connects to Google Calendar or Microsoft Graph, and none copies events between third-party accounts. They pair well with a sync tool rather than replacing one."
      >
        <CompareProjectList>
          {SERVER_PROJECTS.map((project) => (
            <CompareProjectCard key={project.name} {...project} sources={SOURCES} />
          ))}
        </CompareProjectList>
      </CompareSection>

      <CompareSection
        title="Clients and device sync"
        description="These get calendars onto your devices. Included because they turn up in the same searches, not because they are substitutes."
      >
        <CompareProjectList>
          {CLIENT_PROJECTS.map((project) => (
            <CompareProjectCard key={project.name} {...project} sources={SOURCES} />
          ))}
        </CompareProjectList>
      </CompareSection>

      <CompareSection title="Picking between them">
        <CompareVerdictGrid>
          <CompareVerdictCard
            title="Pick something else"
            points={[
              "You want a calendar server you own: Radicale or Baïkal, or Nextcloud if you want the rest of it too.",
              "You want end-to-end encryption over your own calendar data: EteSync.",
              "You are comfortable with a CLI, a cron job, and configuration files: vdirsyncer costs nothing to run.",
              "You already run n8n or Activepieces and want the sync logic under your control: build it there.",
              "You need your CalDAV calendars on Android: DAVx⁵, alongside whatever else you use.",
            ]}
          />
          <CompareVerdictCard
            title="Pick Keeper.sh"
            points={[
              "You want mirroring between accounts to work without you assembling it.",
              "You need Google and Microsoft over their real APIs, with incremental sync, not CalDAV shims.",
              "You want a hosted option and a self-hosted option with the same feature set.",
              "You want AGPL-3.0 rather than a source-available licence with use restrictions.",
              "You want anonymised busy blocks by default rather than full event copies.",
            ]}
          />
        </CompareVerdictGrid>
      </CompareSection>

      <CompareSection title="What Keeper.sh does not do">
        <CompareProse>
          <Text size="sm" tone="muted" className="leading-6">
            Keeper.sh is not a calendar server. It does not store your calendars for you in a way you would
            want to point a client at, and it is not a replacement for Radicale, Baïkal or Nextcloud. It has
            no mobile app, no desktop client, and no end-to-end encryption of the events it holds.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            It also polls rather than subscribing to provider webhooks, so changes take up to a minute on
            Pro and up to 30 minutes on the free plan to reach a destination calendar. Incremental sync
            works on Google and Outlook only; CalDAV sources are refetched and diffed on every cycle.
          </Text>
          <Text size="sm" tone="muted" className="leading-6">
            Self-hosting is genuinely full-featured, with one caveat worth stating: passkey and social login
            are only enabled in commercial mode, so a self-hosted instance uses email and password.
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
