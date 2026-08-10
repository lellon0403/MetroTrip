import type { components } from "@metrotrip/contracts";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, logoutSession, refreshSession, saveSession } from "./api";
import { clearOfflineCache, prepareOfflineOwner } from "./offline";

type User = components["schemas"]["UserProfile"];
type Session = { status: "loading" | "anonymous" | "authenticated"; user: User | null; login(email: string, password: string): Promise<void>; logout(): Promise<void> };
const Context = createContext<Session | null>(null);

export function MobileSessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Session["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { void (async () => { if (await refreshSession()) { try { const profile = await apiFetch<User>("/me"); await prepareOfflineOwner(profile.id); setUser(profile); setStatus("authenticated"); return; } catch {} } setStatus("anonymous"); })(); }, []);
  const value = useMemo<Session>(() => ({ status, user, async login(email, password) { const result = await apiFetch<components["schemas"]["AuthResponse"]>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false); if (!result.refreshToken) throw new Error("모바일 갱신 토큰을 받지 못했습니다."); await prepareOfflineOwner(result.user.id); await saveSession(result.accessToken, result.refreshToken); setUser(result.user); setStatus("authenticated"); }, async logout() { try { await logoutSession(); } finally { await clearOfflineCache(); setUser(null); setStatus("anonymous"); } } }), [status, user]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMobileSession() { const value = useContext(Context); if (!value) throw new Error("MobileSessionProvider가 필요합니다."); return value; }
