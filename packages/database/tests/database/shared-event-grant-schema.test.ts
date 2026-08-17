import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sourceDestinationMappingsTable } from "../../src/database/schema";

const columnsByName = () => Object.fromEntries(
  getTableConfig(sourceDestinationMappingsTable).columns.map((column) => [column.name, column]),
);

/*
 * The permission to write to a meeting the user organises is stored as the instant it was
 * given, so the disclosure can say when, and nullable so a pair that has never been asked
 * reads as not granted. It carries no default for the same reason: a permission that
 * appears on a row nobody answered for is the one thing this column must never do.
 *
 * Unlike deleteConfirmationApprovedAt it is not read against a TTL. That one answers
 * whether a particular disappearance was real and must expire; this answers what Keeper.sh
 * may ever do, and expiring it would revoke a permission the user never withdrew.
 */
describe("the pair remembers the permission to write to a meeting", () => {
  it("records when shared-event writes were granted", () => {
    const column = columnsByName().sharedEventWritesGrantedAt;

    expect(column).toBeDefined();
    expect(column?.notNull).toBe(false);
    expect(column?.hasDefault).toBe(false);
  });
});
