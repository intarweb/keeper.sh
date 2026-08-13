import { describe, expect, it } from "vitest";
import {
  createDatabaseEchoAdoption,
  ECHO_ADOPTION_BATCH_SIZE,
} from "../../../src/core/sync-engine/echo-adoption";
import type { EchoAdoption } from "../../../src/core/sync/operations";

const RECORDED_AT = new Date("2026-03-08T12:00:00.000Z");

const createAdoptions = (count: number): EchoAdoption[] =>
  Array.from({ length: count }, (_unused, index) => ({
    contentHash: `hash-${index}`,
    mappingId: `019c0000-0000-7000-8000-${index.toString().padStart(12, "0")}`,
  }));

interface RecordedStatement {
  parameterCount: number;
}

const createFakeDatabase = (
  onExecute?: () => void,
): { database: unknown; statements: RecordedStatement[] } => {
  const statements: RecordedStatement[] = [];
  const database = {
    execute: (query: { queryChunks?: unknown[] }) => {
      onExecute?.();
      const chunks = query.queryChunks ?? [];
      statements.push({
        parameterCount: chunks.filter(
          (chunk) => typeof chunk === "object" && chunk !== null && "value" in chunk,
        ).length,
      });
      return Promise.resolve({ rowCount: 0 });
    },
  };
  return { database, statements };
};

describe("createDatabaseEchoAdoption", () => {
  it("writes nothing when there is no adoption to record", async () => {
    const { database, statements } = createFakeDatabase();

    await createDatabaseEchoAdoption(database as never)([], RECORDED_AT);

    expect(statements).toHaveLength(0);
  });

  it("splits adoptions across chunks at the batch boundary", async () => {
    const { database, statements } = createFakeDatabase();

    await createDatabaseEchoAdoption(database as never)(
      createAdoptions(ECHO_ADOPTION_BATCH_SIZE + 1),
      RECORDED_AT,
    );

    expect(statements).toHaveLength(2);
  });

  it("writes a single statement at exactly the batch size", async () => {
    const { database, statements } = createFakeDatabase();

    await createDatabaseEchoAdoption(database as never)(
      createAdoptions(ECHO_ADOPTION_BATCH_SIZE),
      RECORDED_AT,
    );

    expect(statements).toHaveLength(1);
  });

  /*
   * A concurrent run replaces a mapping by deleting and re-inserting it, so an
   * adoption written against the previous identifier legitimately matches no row.
   */
  it("does not throw when the mapping was replaced concurrently", async () => {
    const database = { execute: () => Promise.resolve({ rowCount: 0 }) };

    await expect(
      createDatabaseEchoAdoption(database as never)(createAdoptions(3), RECORDED_AT),
    ).resolves.toBeUndefined();
  });

  it("propagates a database failure rather than swallowing it", async () => {
    const database = { execute: () => Promise.reject(new Error("connection reset")) };

    await expect(
      createDatabaseEchoAdoption(database as never)(createAdoptions(1), RECORDED_AT),
    ).rejects.toThrow("connection reset");
  });
});
