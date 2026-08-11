import { createFileRoute, notFound } from "@tanstack/react-router";
import { Heading1, Heading2, Heading3 } from "@/components/ui/primitives/heading";
import { Prose } from "@/components/ui/primitives/prose";
import { Text } from "@/components/ui/primitives/text";
import { ArticleCta } from "@/features/marketing/components/article-cta";
import { findCompareArticleBySlug } from "@/lib/compare-articles";
import { formatIsoDate } from "@/utils/date";
import {
  breadcrumbSchema,
  canonicalUrl,
  compareArticleSchema,
  faqPageSchema,
  jsonLdScript,
  seoMeta,
  webPageSchema,
} from "@/lib/seo";

export const Route = createFileRoute("/(marketing)/compare/$slug")({
  component: CompareArticlePage,
  head: ({ params }) => {
    const article = findCompareArticleBySlug(params.slug);
    if (!article) {
      return { meta: [{ title: "Compare · Keeper.sh" }] };
    }

    const articlePath = `/compare/${article.slug}`;
    return {
      links: [{ rel: "canonical", href: canonicalUrl(articlePath) }],
      meta: [
        ...seoMeta({
          title: article.metadata.title,
          description: article.metadata.description,
          path: articlePath,
          type: "article",
        }),
        { content: article.metadata.tags.join(", "), name: "keywords" },
        { content: article.metadata.createdAt, property: "article:published_time" },
        { content: article.metadata.updatedAt, property: "article:modified_time" },
        ...article.metadata.tags.map((tag) => ({
          content: tag,
          property: "article:tag",
        })),
      ],
      scripts: [
        jsonLdScript(
          compareArticleSchema({
            title: article.metadata.title,
            description: article.metadata.description,
            slug: article.slug,
            createdAt: article.metadata.createdAt,
            updatedAt: article.metadata.updatedAt,
            tags: article.metadata.tags,
          }),
        ),
        jsonLdScript(
          webPageSchema(article.metadata.title, article.metadata.description, articlePath),
        ),
        jsonLdScript(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Compare", path: "/compare" },
            { name: article.metadata.title, path: articlePath },
          ]),
        ),
        jsonLdScript(faqPageSchema(articlePath, article.metadata.faq)),
      ],
    };
  },
});

function CompareArticlePage() {
  const { slug } = Route.useParams();
  const article = findCompareArticleBySlug(slug);
  if (!article) {
    throw notFound();
  }

  return (
    <div className="flex flex-col gap-6 py-16">
      <header className="flex flex-col gap-2">
        <Text size="xs" tone="muted" className="uppercase opacity-75">
          Compare · Checked {formatIsoDate(article.metadata.checkedAt)}
        </Text>
        <Heading1>{article.metadata.title}</Heading1>
        <Text size="base" tone="muted" className="leading-6">
          {article.metadata.description}
        </Text>
      </header>

      <Prose>{article.content}</Prose>

      <section className="flex flex-col gap-2">
        <Heading2 as="h2">Frequently asked questions</Heading2>
        {article.metadata.faq.map((entry) => (
          <div key={entry.question} className="flex flex-col gap-1">
            <Heading3 as="h3">{entry.question}</Heading3>
            <Text size="base" tone="muted" className="leading-7">
              {entry.answer}
            </Text>
          </div>
        ))}
      </section>

      <ArticleCta />
    </div>
  );
}
