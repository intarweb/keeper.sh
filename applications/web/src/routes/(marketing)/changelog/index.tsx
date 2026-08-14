import { createFileRoute, Link } from "@tanstack/react-router";
import { Heading1, Heading2, Heading3 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { Breadcrumb } from "@/components/ui/primitives/breadcrumb";
import { changelogFeatures, changelogReleases, type ChangelogNote } from "@/lib/changelog";
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

function NoteList({ label, notes }: { label: string; notes: ChangelogNote[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <Heading3 as="h3">{label}</Heading3>
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
    <div className="flex flex-col gap-8 py-16">
      <Breadcrumb items={breadcrumbs} />
      <header className="flex flex-col gap-1.5">
        <Heading1>{PAGE_HEADING}</Heading1>
        <Text size="base" tone="muted" className="max-w-[64ch] leading-6">
          {PAGE_DESCRIPTION}
        </Text>
      </header>

      <div className="flex flex-col gap-12">
        {changelogReleases.map((release) => (
          <article key={release.date} id={`release-${release.date}`} className="flex flex-col gap-6 scroll-mt-24">
            <Text as="p" size="sm" tone="default">
              <time dateTime={release.date}>{formatIsoDate(release.date)}</time>
            </Text>

            {release.features.map((feature) => (
              <section key={feature.slug} id={feature.slug} className="flex flex-col gap-1.5 scroll-mt-24">
                <Heading2 as="h2">
                  <Link
                    className="hover:text-foreground-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    params={{ slug: feature.slug }}
                    to="/changelog/$slug"
                  >
                    {feature.title}
                  </Link>
                </Heading2>
                <Text size="sm" tone="muted" className="max-w-[64ch] leading-6">
                  {feature.summary}
                </Text>
              </section>
            ))}

            <NoteList label="New" notes={release.added} />
            <NoteList label="Improved" notes={release.improved} />
            <NoteList label="Fixed" notes={release.fixed} />

            <Text size="xs" tone="disabled">
              {release.build}
            </Text>
          </article>
        ))}
      </div>
    </div>
  );
}
