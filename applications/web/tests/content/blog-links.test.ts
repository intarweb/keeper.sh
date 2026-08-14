import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BLOG_DIRECTORY = join(import.meta.dirname, "../../src/content/blog");
const ABSOLUTE_SELF_LINK = /]\(https?:\/\/(?:www\.)?keeper\.sh(?![\w.-])[^)]*\)/g;

const posts = readdirSync(BLOG_DIRECTORY).filter((entry) => entry.endsWith(".mdx"));

describe("blog post links", () => {
  it("has posts to check", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it.each(posts)("links to keeper.sh with root-relative paths in %s", (post) => {
    const content = readFileSync(join(BLOG_DIRECTORY, post), "utf8");

    expect(content.match(ABSOLUTE_SELF_LINK)).toBeNull();
  });
});
