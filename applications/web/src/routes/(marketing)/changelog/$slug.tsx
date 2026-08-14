import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Heading1 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { TextLink } from "@/components/ui/primitives/text-link";
import { Breadcrumb } from "@/components/ui/primitives/breadcrumb";
import { NotFoundState } from "@/components/ui/shells/not-found";
import { ArticleCta } from "@/features/marketing/components/article-cta";
import { changelogReleaseOf, findChangelogFeature } from "@/lib/changelog";
import { formatIsoDate } from "@/utils/date";
import {
  breadcrumbSchema,
  breadcrumbTrail,
  canonicalUrl,
  changelogEntrySchema,
  jsonLdScript,
  seoMeta,
} from "@/lib/seo";

const INLINE_LINK_CLASS = "text-sm tracking-tight underline underline-offset-2 text-foreground";

const entryBreadcrumbs = (title: string, slug: string) =>
  breadcrumbTrail({ name: "Changelog", path: "/changelog" }, { name: title, path: `/changelog/${slug}` });

export const Route = createFileRoute("/(marketing)/changelog/$slug")({
  loader: ({ params }) => {
    if (!findChangelogFeature(params.slug)) {
      throw notFound();
    }
  },
  component: ChangelogEntryPage,
  notFoundComponent: NotFoundState,
  head: ({ params }) => {
    const feature = findChangelogFeature(params.slug);
    const release = changelogReleaseOf(params.slug);
    if (!feature || !release) {
      return {
        meta: [
          { title: "Changelog · Keeper.sh" },
          { content: "noindex", name: "robots" },
        ],
      };
    }

    const path = `/changelog/${params.slug}`;
    return {
      links: [{ rel: "canonical", href: canonicalUrl(path) }],
      meta: [
        ...seoMeta({
          title: feature.title,
          description: feature.summary,
          path,
          type: "article",
        }),
        { content: release.date, property: "article:published_time" },
      ],
      scripts: [
        jsonLdScript(changelogEntrySchema({
          title: feature.title,
          description: feature.summary,
          slug: params.slug,
          date: release.date,
        })),
        jsonLdScript(breadcrumbSchema(entryBreadcrumbs(feature.title, params.slug))),
      ],
    };
  },
});

function ChangelogEntryPage() {
  const { slug } = Route.useParams();
  const feature = findChangelogFeature(slug);
  const release = changelogReleaseOf(slug);
  if (!feature || !release) {
    throw notFound();
  }

  return (
    <div className="flex flex-col gap-6 py-16">
      <Breadcrumb items={entryBreadcrumbs(feature.title, slug)} />
      <header className="flex flex-col gap-2">
        <Heading1>{feature.title}</Heading1>
        <Text size="sm" tone="muted">
          <time dateTime={release.date}>{formatIsoDate(release.date)}</time>
          {" · "}
          {release.build}
        </Text>
      </header>

      <div className="flex flex-col gap-3 max-w-[64ch]">
        <Text size="base" tone="default" className="leading-7">
          {feature.summary}
        </Text>
        {feature.body.map((paragraph) => (
          <Text key={paragraph} size="base" tone="muted" className="leading-7">
            {paragraph}
          </Text>
        ))}
        <Text size="sm" tone="muted">
          Read more about{" "}
          {feature.link.to === "/blog/$slug" ? (
            <Link
              className={INLINE_LINK_CLASS}
              params={feature.link.params}
              to="/blog/$slug"
            >
              {feature.link.label}
            </Link>
          ) : (
            <TextLink align="left" size="sm" to={feature.link.to} tone="default">
              {feature.link.label}
            </TextLink>
          )}
          .
        </Text>
      </div>

      <TextLink align="left" size="sm" to="/changelog" tone="muted">
        All changes, newest first
      </TextLink>

      <ArticleCta />
    </div>
  );
}
