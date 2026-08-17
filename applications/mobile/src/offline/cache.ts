import * as SQLite from "expo-sqlite";

import {
  cacheKindForPath,
  minimizeCacheValueForPath,
  type CacheKind,
} from "@/offline/cache-policy";

const CACHE_SCHEMA_VERSION = 2;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_RECORD_BYTES = 256 * 1024;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheRecord {
  body: string;
  expires_at: number;
  schema_version: number;
  updated_at: number;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync("keeper-read-cache.db").then(
    async (db) => {
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA secure_delete = ON;");
      const columns = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(read_cache)",
      );
      const names = new Set(columns.map(({ name }) => name));
      if (
        columns.length > 0 &&
        !["expires_at", "schema_version", "size_bytes"].every((name) =>
          names.has(name),
        )
      ) {
        await db.execAsync("DROP TABLE read_cache;");
      }
      await db.execAsync(`
      CREATE TABLE IF NOT EXISTS read_cache (
        scope TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        body TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        PRIMARY KEY (scope, cache_key)
      );
      CREATE INDEX IF NOT EXISTS read_cache_expiry ON read_cache (expires_at);
    `);
      return db;
    },
  );
  return databasePromise;
}

export async function readCache<T>(
  scope: string,
  key: string,
): Promise<{ data: T; updatedAt: number } | null> {
  const db = await database();
  const record = await db.getFirstAsync<CacheRecord>(
    "SELECT body, updated_at, expires_at, schema_version FROM read_cache WHERE scope = ? AND cache_key = ?",
    [scope, key],
  );
  if (!record) return null;
  if (
    record.schema_version !== CACHE_SCHEMA_VERSION ||
    record.expires_at <= Date.now()
  ) {
    await db.runAsync(
      "DELETE FROM read_cache WHERE scope = ? AND cache_key = ?",
      [scope, key],
    );
    return null;
  }
  try {
    return { data: JSON.parse(record.body) as T, updatedAt: record.updated_at };
  } catch {
    await db.runAsync(
      "DELETE FROM read_cache WHERE scope = ? AND cache_key = ?",
      [scope, key],
    );
    return null;
  }
}

export async function writeCache(
  scope: string,
  key: string,
  data: unknown,
  kind: CacheKind = cacheKindForPath(key),
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  if (kind === "none") return;
  const body = JSON.stringify(minimizeCacheValueForPath(kind, key, data));
  const size = new TextEncoder().encode(body).byteLength;
  if (size > MAX_RECORD_BYTES) return;
  const db = await database();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO read_cache
      (scope, cache_key, body, updated_at, expires_at, schema_version, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [scope, key, body, now, now + ttlMs, CACHE_SCHEMA_VERSION, size],
  );
  await pruneCache(db, now);
}

async function pruneCache(
  db: SQLite.SQLiteDatabase,
  now: number,
): Promise<void> {
  await db.runAsync(
    "DELETE FROM read_cache WHERE expires_at <= ? OR schema_version != ?",
    [now, CACHE_SCHEMA_VERSION],
  );
  await db.runAsync(
    `DELETE FROM read_cache WHERE rowid IN (
      SELECT rowid FROM read_cache ORDER BY updated_at DESC LIMIT -1 OFFSET ?
    )`,
    [MAX_CACHE_ENTRIES],
  );
  const total = await db.getFirstAsync<{ bytes: number }>(
    "SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM read_cache",
  );
  let bytes = total?.bytes ?? 0;
  while (bytes > MAX_CACHE_BYTES) {
    const oldest = await db.getFirstAsync<{
      rowid: number;
      size_bytes: number;
    }>(
      "SELECT rowid, size_bytes FROM read_cache ORDER BY updated_at ASC LIMIT 1",
    );
    if (!oldest) break;
    await db.runAsync("DELETE FROM read_cache WHERE rowid = ?", [oldest.rowid]);
    bytes -= oldest.size_bytes;
  }
}

export async function clearCacheScope(scope: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM read_cache WHERE scope = ?", [scope]);
  await compactDeletedCache(db);
}

export async function clearCacheProfile(profileId: string): Promise<void> {
  const db = await database();
  const prefix = `${profileId}:`;
  await db.runAsync(
    "DELETE FROM read_cache WHERE substr(scope, 1, length(?)) = ?",
    [prefix, prefix],
  );
  await compactDeletedCache(db);
}

export async function clearAllCache(): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM read_cache");
  await compactDeletedCache(db);
}

async function compactDeletedCache(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
  await db.execAsync("VACUUM;");
}

export const cacheLimits = {
  maxBytes: MAX_CACHE_BYTES,
  maxEntries: MAX_CACHE_ENTRIES,
  maxRecordBytes: MAX_RECORD_BYTES,
  schemaVersion: CACHE_SCHEMA_VERSION,
};

export {
  cacheKindForPath,
  minimizeCacheValue,
  minimizeCacheValueForPath,
  type CacheKind,
} from "@/offline/cache-policy";
