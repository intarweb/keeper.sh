import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { staticPagePaths } from "../../src/lib/static-page-paths";

const pagesFile = resolve(import.meta.dirname, "../../src/content/pages.yaml");

const sitemapPaths = (): string[] => {
  const pages: unknown = parseYaml(readFileSync(pagesFile, "utf-8"));
  if (!Array.isArray(pages)) {
    throw new Error(`Expected a list of pages in ${pagesFile}.`);
  }
  return pages.map((page: unknown) => (page as { path: string }).path);
};

describe("staticPagePaths", () => {
  it("covers every page the sitemap publishes, so none skips the HTML cache", () => {
    expect([...staticPagePaths].sort()).toEqual([...sitemapPaths()].sort());
  });

  it("lists each path once", () => {
    expect(new Set(staticPagePaths).size).toBe(staticPagePaths.length);
  });
});
