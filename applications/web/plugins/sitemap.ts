import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { XMLBuilder } from "fast-xml-parser";
import { parse as parseYaml } from "yaml";
import { staticPageMetadata } from "../src/lib/page-metadata";
import {
  assertIndexableRoutesCovered,
  parseIndexableRoutePaths,
} from "../src/lib/indexable-routes";

const SITE_URL = "https://www.keeper.sh";
const BLOG_BASE_PATH = "/blog";
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SitemapEntry {
  path: string;
  lastmod: string;
}

function readStaticEntries(): SitemapEntry[] {
  return staticPageMetadata.map(({ path, updatedAt }) => {
    if (!ISO_DATE_PATTERN.test(updatedAt)) {
      throw new Error(
        `Static page "${path}" needs a YYYY-MM-DD updatedAt, received ${JSON.stringify(updatedAt)}.`,
      );
    }

    return { path, lastmod: updatedAt };
  });
}

function buildBlogIndexEntry(blogEntries: SitemapEntry[]): SitemapEntry {
  const [first] = blogEntries;
  if (!first) {
    throw new Error("The blog index lastmod cannot be derived without any blog posts.");
  }

  const lastmod = blogEntries.reduce(
    (newest, entry) => (entry.lastmod > newest ? entry.lastmod : newest),
    first.lastmod,
  );

  return { path: BLOG_BASE_PATH, lastmod };
}

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
      path: `${basePath}/${frontmatter.slug}`,
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
        loc: `${SITE_URL}${entry.path}`,
        lastmod: entry.lastmod,
      })),
    },
  };

  return String(xmlBuilder.build(document));
}

export function sitemapPlugin(): Plugin {
  let blogDir: string;
  let routeTreeFile: string;

  return {
    name: "keeper-sitemap",
    apply: "build",

    configResolved(config) {
      blogDir = resolve(config.root, "src/content/blog");
      routeTreeFile = resolve(config.root, "src/generated/tanstack/route-tree.generated.ts");
    },

    generateBundle() {
      const staticEntries = readStaticEntries();
      const blogEntries = discoverContentEntries(blogDir, BLOG_BASE_PATH, "Blog post");
      const blogIndexEntry = buildBlogIndexEntry(blogEntries);

      assertIndexableRoutesCovered(
        [...staticEntries, blogIndexEntry].map((entry) => entry.path),
        parseIndexableRoutePaths(readFileSync(routeTreeFile, "utf-8")),
      );

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml([...staticEntries, blogIndexEntry, ...blogEntries]),
      });
    },
  };
}
