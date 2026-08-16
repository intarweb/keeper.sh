import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWriteBackFieldSummary } from "@/features/dashboard/components/write-back-summary";

const PAGE = readFileSync(
  join(import.meta.dirname, "../../src/content/docs/two-way-sync.mdx"),
  "utf8",
);

const SCHEMA = readFileSync(
  join(import.meta.dirname, "../../../../packages/database/src/database/schema.ts"),
  "utf8",
);

const DEFAULT_EXCLUSIONS = {
  excludeEventDescription: true,
  excludeEventLocation: true,
  excludeEventName: true,
};

/*
 * The page is what a user reads before switching two-way sync on, and its account of what
 * travels is the whole of what they know at that point. A new calendar hides the title,
 * the description and the location on copies without anybody choosing to, so on the
 * connection every user starts with, none of the three is ever written back.
 */
describe("the two-way sync page and the default connection agree", () => {
  it("hides the three text fields on a calendar nobody has configured", () => {
    expect(SCHEMA).toContain("excludeEventName: boolean().notNull().default(true)");
    expect(SCHEMA).toContain("excludeEventDescription: boolean().notNull().default(true)");
    expect(SCHEMA).toContain("excludeEventLocation: boolean().notNull().default(true)");
  });

  it("writes back only the schedule on a default connection", () => {
    const summary = buildWriteBackFieldSummary(DEFAULT_EXCLUSIONS, "Work");
    expect(summary.written).not.toContain("title");
    expect(summary.written).not.toContain("description");
    expect(summary.written).not.toContain("location");
  });

  it("says the three are hidden by default rather than by a choice the user made", () => {
    expect(PAGE).toMatch(/hidden on copies by default|hidden by default/u);
  });
});
