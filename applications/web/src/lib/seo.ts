const SITE_URL = "https://www.keeper.sh";
const SITE_NAME = "Keeper.sh";
const SITE_ALTERNATE_NAME = "Keeper";

// Search engines only. This must never appear in visible page copy — it reads as a
// defensive aside about a competitor the reader was not thinking about.
export const BRAND_DISAMBIGUATION =
  "Keeper.sh is a calendar syncing tool. It is not affiliated with Keeper Security, the password manager.";
const DEFAULT_IMAGE_PATH = "/open-graph.png";

export function canonicalUrl(path: string): string {
  return `${SITE_URL}/${path.replace(/^\/+/, "")}`;
}

function entityId(path: string, fragment: string): string {
  const url = canonicalUrl(path);
  return `${url.endsWith("/") ? url : `${url}/`}#${fragment}`;
}

export function jsonLdScript(data: Record<string, unknown>) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

export interface SeoMetaOptions {
  title: string;
  description: string;
  path: string;
  type?: string;
  brandPosition?: "before" | "after";
  imagePath?: string;
}

export function seoMeta({
  title,
  description,
  path,
  type = "website",
  brandPosition = "after",
  imagePath = DEFAULT_IMAGE_PATH,
}: SeoMetaOptions) {
  const fullTitle = brandPosition === "before"
    ? `${SITE_NAME} — ${title}`
    : `${title} · ${SITE_NAME}`;
  const imageUrl = canonicalUrl(imagePath);
  return [
    { title: fullTitle },
    { content: description, name: "description" },
    { content: type, property: "og:type" },
    { content: title, property: "og:title" },
    { content: description, property: "og:description" },
    { content: canonicalUrl(path), property: "og:url" },
    { content: SITE_NAME, property: "og:site_name" },
    { content: imageUrl, property: "og:image" },
    { content: "1200", property: "og:image:width" },
    { content: "630", property: "og:image:height" },
    { content: "summary_large_image", name: "twitter:card" },
    { content: title, name: "twitter:title" },
    { content: description, name: "twitter:description" },
    { content: imageUrl, name: "twitter:image" },
  ];
}

export type SeoMetaTag = ReturnType<typeof seoMeta>[number];

/**
 * Builds a route `head` from the page's SEO options, so the self-referencing
 * canonical is derived from `path` rather than restated by every route.
 */
export function seoHead({
  meta = [],
  links = [],
  scripts = [],
  ...seo
}: SeoMetaOptions & {
  meta?: SeoMetaTag[];
  links?: Array<{ rel: string; href: string; type?: string; title?: string }>;
  scripts?: Array<ReturnType<typeof jsonLdScript>>;
}) {
  return {
    links: [{ rel: "canonical", href: canonicalUrl(seo.path) }, ...links],
    meta: [...seoMeta(seo), ...meta],
    scripts,
  };
}

export function notFoundHead() {
  return { meta: [{ title: `Page not found · ${SITE_NAME}` }] };
}

export const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/512x512-on-light.png`,
        width: 512,
        height: 512,
      },
      disambiguatingDescription: BRAND_DISAMBIGUATION,
      sameAs: ["https://github.com/ridafkih/keeper.sh"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export type BreadcrumbTrailItem = { name: string; path: string };

export function breadcrumbTrail(...items: BreadcrumbTrailItem[]): BreadcrumbTrailItem[] {
  return [{ name: "Home", path: "/" }, ...items];
}

export function breadcrumbSchema(items: BreadcrumbTrailItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export function webPageSchema(name: string, description: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": entityId(path, "webpage"),
    name,
    description,
    url: canonicalUrl(path),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function faqPageSchema(
  path: string,
  questions: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${canonicalUrl(path)}/#faqpage`,
    mainEntity: questions.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: SITE_NAME,
    description:
      "Copies your events between your personal, work and school calendars, so all of them show you as busy at the same times.",
    url: SITE_URL,
    image: `${SITE_URL}/open-graph.png`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description:
          "Enough for two calendar accounts and three connections.",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "5.00",
        priceCurrency: "USD",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "5.00",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        description:
          "As many calendars as you want, and changes that land within a minute.",
      },
    ],
    provider: { "@id": `${SITE_URL}/#organization` },
  };
}

export function offerCatalogSchema(
  path: string,
  offers: Array<{ name: string; price: string; description: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    "@id": `${canonicalUrl(path)}/#offercatalog`,
    name: `${SITE_NAME} Plans`,
    url: canonicalUrl(path),
    itemListElement: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: offer.price,
        priceCurrency: "USD",
        billingDuration: "P1M",
      },
      description: offer.description,
      itemOffered: { "@id": `${SITE_URL}/#software` },
    })),
  };
}

export function faqSchema(
  path: string,
  items: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${canonicalUrl(path)}/#faq`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: items.map((item) => {
      const question = item.question.trim();
      const answer = item.answer.trim();
      if (!question || !answer) {
        throw new Error(
          `faqSchema requires a question and answer for every item, received ${JSON.stringify(item)}`,
        );
      }
      return {
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      };
    }),
  };
}

export function collectionPageSchema(posts: Array<{ slug: string; metadata: { title: string } }>) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": entityId("/blog", "collectionpage"),
    name: "Blog",
    url: canonicalUrl("/blog"),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: canonicalUrl(`/blog/${post.slug}`),
        name: post.metadata.title,
      })),
    },
  };
}

export const authorPersonSchema = {
  "@type": "Person",
  "@id": `${SITE_URL}/#author`,
  name: "Rida F'kih",
  url: "https://rida.dev",
  sameAs: ["https://github.com/ridafkih"],
};

export function blogPostingSchema(post: {
  title: string;
  description: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  imagePath?: string;
}) {
  const url = canonicalUrl(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": entityId(`/blog/${post.slug}`, "blogposting"),
    headline: post.title,
    description: post.description,
    image: canonicalUrl(post.imagePath ?? DEFAULT_IMAGE_PATH),
    url,
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    keywords: post.tags,
    author: authorPersonSchema,
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}
