import { blogPosts } from "./blog-posts";
import { changelogPaths } from "./changelog";
import { staticPagePaths } from "./static-page-paths";

export const cacheableHtmlPaths: string[] = [
  ...staticPagePaths,
  "/blog",
  ...blogPosts.map((blogPost) => `/blog/${blogPost.slug}`),
  ...changelogPaths,
];
