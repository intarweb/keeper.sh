import { describe, expect, it } from "vitest";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import { createDatabaseWriteBackStore } from "../src/write-back";
import type { SourceEventSnapshot, WriteBackTarget } from "../src/write-back-pass";

const SOURCE_CALENDAR_ID = "source-calendar-id";
const DESTINATION_CALENDAR_ID = "destination-calendar-id";
const MAPPING_ID = "mapping-id-1";

const SNAPSHOT: SourceEventSnapshot = {
  description: "Bring the notes",
  endTime: new Date("2027-05-11T15:00:00.000Z"),
  isAllDay: null,
  location: "Room 4",
  startTime: new Date("2027-05-11T14:00:00.000Z"),
  startTimeZone: "America/Toronto",
  title: "Quarterly review",
};

const createTarget = (mappingId = MAPPING_ID): WriteBackTarget => ({
  deleteIdentifier: "destination-delete-id-1",
  destinationCalendarId: DESTINATION_CALENDAR_ID,
  destinationEventUid: "destination-uid-1",
  eventStateId: "event-state-id-1",
  mappingId,
  sourceCalendarId: SOURCE_CALENDAR_ID,
  sourceEventId: null,
  sourceEventUid: "source-event-uid-1",
});

interface TombstoneRow {
  eventMappingId: string;
  id: string;
  observedAt: Date;
  state: string;
}

const CLAIM_TTL_MS = 10 * 60_000;

/*
 * The live table refuses the upsert while the record still belongs to a pass that is
 * running, which is what stops two overlapping passes from sharing one record and leaving
 * it belonging to neither. A fake that always hands the record over cannot observe either
 * half of that, so the rule the setWhere expresses is modelled here.
 */
const isClaimable = (row: TombstoneRow): boolean => {
  if (row.state === "abandoned") {
    return true;
  }
  if (row.state !== "pending") {
    return false;
  }
  return Date.now() - row.observedAt.getTime() >= CLAIM_TTL_MS;
};

/*
 * The live table carries a unique index on the mapping, so an insert that does not
 * resolve the conflict can never record a second attempt for the same event. Modelling
 * that here is the only way a fake can observe the retry a crashed deletion depends on.
 */
const findFirstParameter = (node: unknown): { value?: unknown } | null => {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (node.constructor?.name === "Param") {
    return node as { value?: unknown };
  }
  const chunks = (node as { queryChunks?: unknown[] }).queryChunks ?? [];
  for (const chunk of chunks) {
    const found = findFirstParameter(chunk);
    if (found) {
      return found;
    }
  }
  return null;
};

const readMappingId = (predicate: unknown): string =>
  String(findFirstParameter(predicate)?.value ?? "");

const createFakeDatabase = () => {
  const rows = new Map<string, TombstoneRow>();
  let counter = 0;

  const database = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (predicate: unknown) => {
          const id = readMappingId(predicate);
          for (const [key, row] of rows) {
            if (row.id === id) {
              rows.set(key, { ...row, state: String(values["state"]) });
            }
          }
          return Promise.resolve();
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => {
          const existing = rows.get(readMappingId(predicate));
          if (!existing) {
            return Promise.resolve([]);
          }
          return Promise.resolve([existing]);
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const eventMappingId = String(values["eventMappingId"]);
        const insertRow = (): TombstoneRow[] => {
          const existing = rows.get(eventMappingId);
          if (existing) {
            throw new Error(
              "duplicate key value violates unique constraint"
              + ' "event_write_back_tombstones_mapping_idx"',
            );
          }
          counter += 1;
          const row = {
            eventMappingId,
            id: `tombstone-${counter}`,
            observedAt: new Date(),
            state: "pending",
          };
          rows.set(eventMappingId, row);
          return [row];
        };

        return {
          onConflictDoUpdate: (config: { set: Record<string, unknown> }) => ({
            returning: () => {
              const existing = rows.get(eventMappingId);
              if (!existing) {
                return Promise.resolve(insertRow());
              }
              if (!isClaimable(existing)) {
                return Promise.resolve([]);
              }
              const updated = {
                ...existing,
                observedAt: new Date(),
                state: String(config.set["state"]),
              };
              rows.set(eventMappingId, updated);
              return Promise.resolve([updated]);
            },
          }),
          returning: () => Promise.resolve(insertRow()),
        };
      },
    }),
  } as unknown as BunSQLDatabase;

  return { database, rows };
};

const createStore = () => {
  const fake = createFakeDatabase();
  const store = createDatabaseWriteBackStore({
    database: fake.database,
    encryptionKey: "encryption-key",
    oauthConfig: {},
    userId: "user-id",
  });
  return { rows: fake.rows, store };
};

const claim = async (
  store: ReturnType<typeof createStore>["store"],
  mappingId = MAPPING_ID,
): Promise<{ id: string; observedAt: Date; priorAttempt: boolean }> => {
  const record = await store.recordTombstone({
    snapshot: SNAPSHOT,
    target: createTarget(mappingId),
  });
  if ("heldByAnotherPass" in record) {
    throw new Error("The record was expected to be claimable and was not");
  }
  return record;
};

/*
 * Moves a record's claim far enough into the past that no pass can still be running behind
 * it — the crashed attempt whose retry has to be able to pick the record back up.
 */
const ageClaim = (
  rows: ReturnType<typeof createStore>["rows"],
  mappingId = MAPPING_ID,
): void => {
  const row = rows.get(mappingId);
  if (!row) {
    throw new Error(`No record was written for ${mappingId}`);
  }
  rows.set(mappingId, {
    ...row,
    observedAt: new Date(row.observedAt.getTime() - CLAIM_TTL_MS - 1),
  });
};

describe("the record of a deletion survives the attempt that was interrupted", () => {
  it("hands back a record for a mapping whose earlier attempt was interrupted", async () => {
    const { rows, store } = createStore();

    const first = await claim(store);
    ageClaim(rows);
    const second = await claim(store);

    expect(first.id).toBeTypeOf("string");
    expect(second.id).toBe(first.id);
  });

  /*
   * While the earlier attempt could still be running, the record is not handed over at all:
   * two passes sharing one record is what left a deletion recorded against an event neither
   * of them ever touched.
   */
  it("refuses the record while an attempt could still be running on it", async () => {
    const { store } = createStore();

    await claim(store);
    const second = await store.recordTombstone({ snapshot: SNAPSHOT, target: createTarget() });

    expect(second).toEqual({ heldByAnotherPass: true });
  });

  /*
   * The record is shared by every attempt on the mapping, so the retry has to be told
   * that an earlier one was left unresolved: releasing it would uncount a source event
   * the timed-out attempt may already have destroyed.
   */
  it("tells the retry that an earlier attempt was left unresolved", async () => {
    const { rows, store } = createStore();

    const first = await claim(store);
    ageClaim(rows);
    const second = await claim(store);

    expect(first.priorAttempt).toBe(false);
    expect(second.priorAttempt).toBe(true);
  });

  it("lets the retry release a record an earlier attempt already abandoned", async () => {
    const { rows, store } = createStore();

    const first = await claim(store);
    await store.abandonTombstone({
      observedAt: first.observedAt,
      tombstoneId: rows.get(MAPPING_ID)?.id ?? "",
    });
    const retry = await claim(store);

    expect(retry.priorAttempt).toBe(false);
  });

  it("returns the record to pending so the retry can complete it", async () => {
    const { rows, store } = createStore();

    await claim(store);
    rows.set(MAPPING_ID, {
      eventMappingId: MAPPING_ID,
      id: rows.get(MAPPING_ID)?.id ?? "",
      observedAt: new Date(),
      state: "abandoned",
    });
    await claim(store);

    expect(rows.get(MAPPING_ID)?.state).toBe("pending");
  });

  it("keeps a separate record per mapping", async () => {
    const { store } = createStore();

    const first = await claim(store);
    const second = await claim(store, "mapping-id-2");

    expect(second.id).not.toBe(first.id);
  });
});
