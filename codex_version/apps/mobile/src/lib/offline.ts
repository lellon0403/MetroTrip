import * as SQLite from "expo-sqlite";

const database = SQLite.openDatabaseAsync("metrotrip.db");

export type TripProgress = Record<string, {
  completedItemIds: string[];
  pendingMutations: { type: "COMPLETE" | "REOPEN"; itemId: string; occurredAt: string }[];
}>;

async function ensureCache() {
  const db = await database;
  await db.execAsync("CREATE TABLE IF NOT EXISTS cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)");
  return db;
}

async function saveCache(cacheKey: string, payload: unknown) {
  const db = await ensureCache();
  await db.runAsync("INSERT INTO cache(cache_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", cacheKey, JSON.stringify(payload), new Date().toISOString());
}

async function loadCache<T>(cacheKey: string, fallback: T) {
  const db = await ensureCache();
  const row = await db.getFirstAsync<{ payload: string; updated_at: string }>("SELECT payload, updated_at FROM cache WHERE cache_key = ?", cacheKey);
  return row ? { value: JSON.parse(row.payload) as T, updatedAt: row.updated_at } : { value: fallback, updatedAt: null };
}

export async function savePlans(plans: unknown[]) {
  await saveCache("plans", plans);
}

export async function loadPlans<T>() {
  const cached = await loadCache<T[]>("plans", []);
  return { items: cached.value, updatedAt: cached.updatedAt };
}

export async function loadTripProgress() {
  return (await loadCache<TripProgress>("trip-progress", {})).value;
}

export async function saveTripProgress(progress: TripProgress) {
  await saveCache("trip-progress", progress);
}

export async function prepareOfflineOwner(userId: string) {
  const current = await loadCache<string>("session-owner", "");
  if (current.value !== userId) {
    const db = await ensureCache();
    await db.runAsync("DELETE FROM cache WHERE cache_key IN ('plans', 'trip-progress')");
  }
  await saveCache("session-owner", userId);
}

export async function clearOfflineCache() {
  const db = await ensureCache();
  await db.runAsync("DELETE FROM cache");
}
