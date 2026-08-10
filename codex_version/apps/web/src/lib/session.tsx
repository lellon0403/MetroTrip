"use client";

import type { components } from "@metrotrip/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, setAccessToken } from "./api";

type UserProfile = components["schemas"]["UserProfile"];
type LoginRequest = components["schemas"]["LoginRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];
type SessionStatus = "loading" | "authenticated" | "anonymous";

type SessionContextValue = {
  status: SessionStatus;
  user: UserProfile | null;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  updateProfile: (displayName: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "error" in error) {
    const envelope = error as { error?: { message?: string } };
    if (envelope.error?.message) return envelope.error.message;
  }
  return "요청을 처리하지 못했습니다.";
}

export class SessionRequestError extends Error {}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [refreshAfterSeconds, setRefreshAfterSeconds] = useState<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyAuth = useCallback((data: components["schemas"]["AuthResponse"]) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.POST("/api/v1/auth/refresh", { body: {} });
      if (!data) {
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
        return false;
      }
      applyAuth(data);
      setRefreshAfterSeconds(Math.max(30, data.expiresIn - 60));
      return true;
    } catch {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      return false;
    }
  }, [applyAuth]);

  useEffect(() => {
    const bootstrap = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(bootstrap);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (refreshAfterSeconds === null) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), refreshAfterSeconds * 1000);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refresh, refreshAfterSeconds]);

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "visible" && status === "authenticated") void refresh(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh, status]);

  const login = useCallback(async (body: LoginRequest) => {
    const { data, error } = await api.POST("/api/v1/auth/login", { body });
    if (!data) throw new SessionRequestError(errorMessage(error));
    applyAuth(data);
    setRefreshAfterSeconds(Math.max(30, data.expiresIn - 60));
  }, [applyAuth]);

  const register = useCallback(async (body: RegisterRequest) => {
    const { data, error } = await api.POST("/api/v1/auth/register", { body });
    if (!data) throw new SessionRequestError(errorMessage(error));
    applyAuth(data);
    setRefreshAfterSeconds(Math.max(30, data.expiresIn - 60));
  }, [applyAuth]);

  const logout = useCallback(async () => {
    await api.POST("/api/v1/auth/logout", { body: {} });
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    setRefreshAfterSeconds(null);
  }, []);

  const updateProfile = useCallback(async (displayName: string) => {
    const { data, error } = await api.PATCH("/api/v1/me", { body: { displayName } });
    if (!data) throw new SessionRequestError(errorMessage(error));
    setUser(data);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    const { response, error } = await api.DELETE("/api/v1/me", {
      body: { password, confirmation: "DELETE" },
    });
    if (!response.ok) throw new SessionRequestError(errorMessage(error));
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    setRefreshAfterSeconds(null);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, refresh, updateProfile, deleteAccount }),
    [status, user, login, register, logout, refresh, updateProfile, deleteAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
