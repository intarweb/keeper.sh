import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { XMLBuilder } from "fast-xml-parser";
import { parse as parseYaml } from "yaml";

const SITE_URL = "https://keeper.sh";
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

interface SitemapEntry {
  loc: string;
  lastmod: string;
}

const staticEntries: SitemapEntry[] = [
  { loc: `${SITE_URL}/`, lastmod: "2026-03-09" },
  { loc: `${SITE_URL}/blog`, lastmod: "2026-03-09" },
  { loc: `${SITE_URL}/privacy`, lastmod: "2025-12-01" },
  { loc: `${SITE_URL}/terms`, lastmod: "2025-12-01" },
  { loc: `${SITE_URL}/compare`, lastmod: "2026-08-11" },
];

function parseFrontmatter(raw: string, file: string): Record<string, unknown> {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) {
    throw new Error(`"${file}" is missing a YAML frontmatter block.`);
  }
  return parseYaml(match[1]);
}

function discoverContentEntries(
  directory: string,
  basePath: string,
  label: string,
): SitemapEntry[] {
  const files = readdirSync(directory).filter((file) => file.endsWith(".mdx"));

  return files.map((file) => {
    const raw = readFileSync(join(directory, file), "utf-8");
    const frontmatter = parseFrontmatter(raw, file);

    if (typeof frontmatter.slug !== "string") {
      throw new Error(`${label} "${file}" is missing a slug.`);
    }

    if (typeof frontmatter.updatedAt !== "string") {
      throw new Error(`${label} "${file}" is missing updatedAt.`);
    }

    return {
      loc: `${SITE_URL}${basePath}/${frontmatter.slug}`,
      lastmod: frontmatter.updatedAt.slice(0, 10),
    };
  });
}

const xmlBuilder = new XMLBuilder({
  format: true,
  ignoreAttributes: false,
  suppressEmptyNode: true,
});

function buildSitemapXml(entries: SitemapEntry[]): string {
  const document = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: entries.map((entry) => ({
        loc: entry.loc,
        lastmod: entry.lastmod,
      })),
    },
  };

  return String(xmlBuilder.build(document));
}

export function sitemapPlugin(): Plugin {
  let blogDir: string;
  let compareDir: string;

  return {
    name: "keeper-sitemap",
    apply: "build",

    configResolved(config) {
      blogDir = resolve(config.root, "src/content/blog");
      compareDir = resolve(config.root, "src/content/compare");
    },

    generateBundle() {
      const entries = [
        ...staticEntries,
        ...discoverContentEntries(blogDir, "/blog", "Blog post"),
        ...discoverContentEntries(compareDir, "/compare", "Compare article"),
      ];

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml(entries),
      });
    },
  };
}
