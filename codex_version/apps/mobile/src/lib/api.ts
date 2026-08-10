import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

async function secureGet(key: string) {
  return Platform.OS === "web" ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string | null) {
  if (Platform.OS === "web") { if (value) globalThis.localStorage?.setItem(key, value); else globalThis.localStorage?.removeItem(key); return; }
  if (value) await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  else await SecureStore.deleteItemAsync(key);
}

export async function saveSession(access: string, refresh: string | null) {
  accessToken = access;
  if (refresh) await secureSet("metrotrip.refresh", refresh);
}

export async function clearSession() {
  accessToken = null;
  await secureSet("metrotrip.refresh", null);
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = await secureGet("metrotrip.refresh");
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Platform": "mobile" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) await clearSession();
        return false;
      }
      const data = await response.json() as { accessToken: string; refreshToken?: string | null };
      await saveSession(data.accessToken, data.refreshToken ?? null);
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function logoutSession() {
  const refreshToken = await secureGet("metrotrip.refresh");
  try {
    if (refreshToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Platform": "mobile" },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    await clearSession();
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("X-Client-Platform", "mobile");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retry && await refreshSession()) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  }
  if (!response.ok) throw new Error(`API ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
