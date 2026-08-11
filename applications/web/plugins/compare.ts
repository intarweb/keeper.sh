import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { type } from "arktype";
import { parse as parseYaml } from "yaml";

const compareQuestionSchema = type({
  "+": "reject",
  answer: "string >= 1",
  question: "string >= 1",
});

const compareArticleMetadataSchema = type({
  "+": "reject",
  blurb: "string >= 1",
  checkedAt: "string.date.iso",
  createdAt: "string.date.iso",
  description: "string >= 1",
  faq: compareQuestionSchema.array(),
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  tags: "string[]",
  title: "string >= 1",
  updatedAt: "string.date.iso",
});

type CompareArticleMetadata = typeof compareArticleMetadataSchema.infer;

interface ProcessedCompareArticle {
  content: string;
  metadata: CompareArticleMetadata;
  slug: string;
}

function toIsoDate(value: string): string {
  return value.slice(0, 10);
}

function normalizeMetadataInput(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) =>
      entry instanceof Date ? [key, entry.toISOString()] : [key, entry],
    ),
  );
}

function splitFrontmatter(
  raw: string,
  filePath: string,
): { content: string; data: unknown } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(
      `Compare article "${filePath}" must start with a YAML frontmatter block.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown YAML parse error";
    throw new Error(
      `Compare frontmatter parsing failed for "${filePath}": ${message}`,
    );
  }

  return {
    content: raw.slice(match[0].length).trimStart(),
    data: parsed ?? {},
  };
}

function parseMetadata(value: unknown, filePath: string): CompareArticleMetadata {
  const result = compareArticleMetadataSchema(normalizeMetadataInput(value));
  if (result instanceof type.errors) {
    throw new Error(`Compare metadata is invalid for "${filePath}": ${result}`);
  }

  if (result.tags.length === 0) {
    throw new Error(
      `Compare metadata tags must contain at least one tag in "${filePath}".`,
    );
  }

  if (result.faq.length === 0) {
    throw new Error(
      `Compare metadata faq must contain at least one question in "${filePath}".`,
    );
  }

  return {
    ...result,
    checkedAt: toIsoDate(result.checkedAt),
    createdAt: toIsoDate(result.createdAt),
    updatedAt: toIsoDate(result.updatedAt),
  };
}

function removeRedundantLeadingHeading(content: string, title: string): string {
  const lines = content.split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  if (!firstLine.startsWith("# ")) return content;

  const headingText = firstLine.slice(2).trim().toLowerCase();
  if (headingText !== title.trim().toLowerCase()) return content;

  const remainder = lines.slice(1);
  const leading = remainder.findIndex((line) => line.trim().length > 0);

  return leading === -1 ? "" : remainder.slice(leading).join("\n");
}

function processCompareDirectory(compareDir: string): ProcessedCompareArticle[] {
  const files = readdirSync(compareDir)
    .filter((file) => file.endsWith(".mdx"))
    .sort();

  const articles = files.map((file) => {
    const raw = readFileSync(join(compareDir, file), "utf-8");
    const { content: rawContent, data } = splitFrontmatter(raw, file);
    const metadata = parseMetadata(data, file);

    return {
      content: removeRedundantLeadingHeading(rawContent, metadata.title),
      metadata,
      slug: metadata.slug,
    };
  });

  const duplicate = articles.find(
    (article, index) =>
      articles.findIndex((other) => other.slug === article.slug) !== index,
  );

  if (duplicate) {
    throw new Error(`Duplicate compare slug "${duplicate.slug}" found in metadata.`);
  }

  return [...articles].sort((a, b) =>
    b.metadata.createdAt.localeCompare(a.metadata.createdAt),
  );
}

const VIRTUAL_MODULE_ID = "virtual:compare-articles";
const RESOLVED_ID = `\0${VIRTUAL_MODULE_ID}`;

export function comparePlugin(): Plugin {
  let compareDir: string;

  return {
    name: "keeper-compare",

    configResolved(config) {
      compareDir = resolve(config.root, "src/content/compare");
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;

      const articles = processCompareDirectory(compareDir);
      return `export const compareArticles = ${JSON.stringify(articles)};`;
    },

    handleHotUpdate({ file, server }) {
      if (file.startsWith(compareDir) && file.endsWith(".mdx")) {
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) {
          server.moduleGraph.invalidateModule(module);
          return [module];
        }
      }
    },
  };
}
