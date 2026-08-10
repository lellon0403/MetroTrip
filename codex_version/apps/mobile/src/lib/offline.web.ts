const KEY = "metrotrip.plans";
const PROGRESS_KEY = "metrotrip.trip-progress";

export type TripProgress = Record<string, {
  completedItemIds: string[];
  pendingMutations: { type: "COMPLETE" | "REOPEN"; itemId: string; occurredAt: string }[];
}>;

export async function savePlans(plans: unknown[]) {
  globalThis.localStorage?.setItem(KEY, JSON.stringify({ items: plans, updatedAt: new Date().toISOString() }));
}

export async function loadPlans<T>() {
  const raw = globalThis.localStorage?.getItem(KEY);
  if (!raw) return { items: [] as T[], updatedAt: null };
  try {
    return JSON.parse(raw) as { items: T[]; updatedAt: string | null };
  } catch {
    return { items: [] as T[], updatedAt: null };
  }
}

export async function loadTripProgress(): Promise<TripProgress> {
  const raw = globalThis.localStorage?.getItem(PROGRESS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) as TripProgress; } catch { return {}; }
}

export async function saveTripProgress(progress: TripProgress) {
  globalThis.localStorage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
}
