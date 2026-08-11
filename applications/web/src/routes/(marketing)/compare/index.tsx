import { createFileRoute, Link } from "@tanstack/react-router";
import { Heading1, Heading3 } from "@/components/ui/primitives/heading";
import { Text } from "@/components/ui/primitives/text";
import { compareArticles } from "@/lib/compare-articles";
import {
  breadcrumbSchema,
  canonicalUrl,
  itemListSchema,
  jsonLdScript,
  seoMeta,
  webPageSchema,
} from "@/lib/seo";
import { formatIsoDate } from "@/utils/date";

const PAGE_DESCRIPTION =
  "Honest comparisons between Keeper.sh and the other tools people use to keep calendars in sync, with every third-party claim linked to its source.";

export const Route = createFileRoute("/(marketing)/compare/")({
  component: CompareDirectoryPage,
  head: () => ({
    links: [{ rel: "canonical", href: canonicalUrl("/compare") }],
    meta: seoMeta({
      title: "Compare Calendar Sync Tools",
      description: PAGE_DESCRIPTION,
      path: "/compare",
    }),
    scripts: [
      jsonLdScript(webPageSchema("Compare Calendar Sync Tools", PAGE_DESCRIPTION, "/compare")),
      jsonLdScript(
        breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Compare", path: "/compare" },
        ]),
      ),
      jsonLdScript(
        itemListSchema(
          "Keeper.sh calendar sync comparisons",
          compareArticles.map((article) => ({
            name: article.metadata.title,
            path: `/compare/${article.slug}`,
          })),
        ),
      ),
    ],
  }),
});

function CompareDirectoryPage() {
  return (
    <div className="flex flex-col gap-8 py-16">
      <header className="flex flex-col gap-1.5">
        <Heading1>Compare</Heading1>
        <Text size="base" tone="muted" className="leading-6">
          {PAGE_DESCRIPTION}
        </Text>
        <Text size="sm" tone="muted" className="leading-6">
          Every claim we make about another product is taken from that product&rsquo;s own public
          pages, linked at the bottom of each comparison with the date we checked it. Where the other
          tool is the better fit, these pages say so.
        </Text>
      </header>

      <div className="flex flex-col gap-3">
        {compareArticles.map((article) => (
          <Link
            key={article.slug}
            className="group block rounded-2xl border border-interactive-border bg-background p-5 shadow-xs transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            params={{ slug: article.slug }}
            to="/compare/$slug"
          >
            <article className="flex flex-col gap-1">
              <Heading3 as="h2" className="group-hover:text-foreground-hover">
                {article.metadata.title}
              </Heading3>
              <Text size="xs" tone="muted" className="opacity-75">
                Checked {formatIsoDate(article.metadata.checkedAt)}
              </Text>
              <Text size="sm" tone="muted" className="leading-6">
                {article.metadata.blurb}
              </Text>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
