import { createFileRoute, Link } from "@tanstack/react-router";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import { Heading1, Heading2 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { ExternalTextLink } from "@/components/ui/primitives/text-link";
import { Breadcrumb } from "@/components/ui/primitives/breadcrumb";
import {
  Timeline,
  TimelineAside,
  TimelineContent,
  TimelineEntry,
} from "@/components/ui/primitives/timeline";
import {
  ChangelogKindDot,
  ChangelogKindTags,
} from "@/features/marketing/components/changelog-kind-tags";
import {
  changelogKindLabel,
  CHANGELOG_KINDS,
  type ChangelogKind,
} from "@/features/marketing/components/changelog-kinds";
import {
  changelogFeatures,
  changelogReleases,
  type ChangelogNote,
  type ChangelogRelease,
} from "@/lib/changelog";
import { formatIsoDate } from "@/utils/date";
import {
  breadcrumbSchema,
  breadcrumbTrail,
  canonicalUrl,
  changelogCollectionSchema,
  jsonLdScript,
  seoMeta,
} from "@/lib/seo";

const PAGE_HEADING = "What's new in Keeper.sh";

/** seoMeta appends the brand, so the tag reads "What's new · Keeper.sh". */
const PAGE_TITLE = "What's new";

const PAGE_DESCRIPTION =
  "Every change to Keeper.sh, newest first: new features, improvements, and the bugs we fixed.";

/**
 * The title carries the affordance in its resting state: it is underlined and
 * ends in an arrow, so it reads as a link before anyone points at it.
 */
const ENTRY_LINK =
  "group rounded-sm hover:text-foreground-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const breadcrumbs = breadcrumbTrail({ name: "Changelog", path: "/changelog" });

export const Route = createFileRoute("/(marketing)/changelog/")({
  component: ChangelogPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl("/changelog") }],
    meta: seoMeta({
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      path: "/changelog",
    }),
    scripts: [
      jsonLdScript(changelogCollectionSchema(PAGE_DESCRIPTION, changelogFeatures)),
      jsonLdScript(breadcrumbSchema(breadcrumbs)),
    ],
  }),
});

/**
 * A featured entry is a new capability, so it counts towards "New" alongside
 * the smaller `added` notes.
 */
function kindsInRelease(release: ChangelogRelease): ChangelogKind[] {
  return CHANGELOG_KINDS.filter((kind) =>
    kind === "added"
      ? release.features.length > 0 || release.added.length > 0
      : release[kind].length > 0,
  );
}

function NoteList({ kind, notes }: { kind: ChangelogKind; notes: ChangelogNote[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2">
        <ChangelogKindDot kind={kind} />
        <Text as="span" size="sm" tone="default">
          {changelogKindLabel[kind]}
        </Text>
      </h3>
      <ul className="flex flex-col gap-2 list-none">
        {notes.map((note) => (
          <li key={note.id} id={note.id} className="scroll-mt-24">
            <Text size="sm" tone="muted" className="leading-6">
              <Text as="span" size="sm" tone="default">
                {note.area}
              </Text>
              {" — "}
              {note.summary}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangelogPage() {
  return (
    <div className="flex flex-col gap-12 py-16">
      <div className="flex flex-col gap-8">
        <Breadcrumb items={breadcrumbs} />
        <header className="flex flex-col items-start gap-3">
          <Heading1>{PAGE_HEADING}</Heading1>
          <Text size="base" tone="muted" className="max-w-[64ch] leading-6">
            {PAGE_DESCRIPTION}
          </Text>
          <ExternalTextLink align="left" href="/changelog.xml" size="sm" tone="muted">
            Follow by RSS
          </ExternalTextLink>
        </header>
      </div>

      <Timeline>
        {changelogReleases.map((release) => (
          <TimelineEntry
            key={release.date}
            className="scroll-mt-24"
            id={`release-${release.date}`}
          >
            <TimelineAside>
              <Text as="p" size="sm" tone="default">
                <time dateTime={release.date}>{formatIsoDate(release.date)}</time>
              </Text>
              <Text size="xs" tone="disabled">
                {release.build}
              </Text>
            </TimelineAside>

            <TimelineContent>
              <ChangelogKindTags kinds={kindsInRelease(release)} />

              {release.features.map((feature) => (
                <section
                  key={feature.slug}
                  className="flex flex-col gap-2 scroll-mt-24"
                  id={feature.slug}
                >
                  <Heading2 as="h2">
                    <Link
                      className={ENTRY_LINK}
                      params={{ slug: feature.slug }}
                      to="/changelog/$slug"
                    >
                      <span className="underline underline-offset-4">{feature.title}</span>
                      <ArrowRight
                        aria-hidden="true"
                        className="ml-1.5 inline size-5 align-middle transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </Heading2>
                  <Text size="sm" tone="muted" className="max-w-[64ch] leading-6">
                    {feature.summary}
                  </Text>
                </section>
              ))}

              {CHANGELOG_KINDS.map((kind) => (
                <NoteList key={kind} kind={kind} notes={release[kind]} />
              ))}
            </TimelineContent>
          </TimelineEntry>
        ))}
      </Timeline>
    </div>
  );
}
