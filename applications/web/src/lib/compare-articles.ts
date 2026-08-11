// @ts-expect-error - virtual module provided by plugins/compare.ts
import { compareArticles as processedArticles } from "virtual:compare-articles";

export interface CompareQuestion {
  answer: string;
  question: string;
}

export interface CompareArticleMetadata {
  blurb: string;
  checkedAt: string;
  createdAt: string;
  description: string;
  faq: CompareQuestion[];
  slug: string;
  tags: string[];
  title: string;
  updatedAt: string;
}

export interface CompareArticle {
  content: string;
  metadata: CompareArticleMetadata;
  slug: string;
}

export const compareArticles: CompareArticle[] = processedArticles;

export function findCompareArticleBySlug(slug: string): CompareArticle | undefined {
  return compareArticles.find((article) => article.slug === slug);
}
