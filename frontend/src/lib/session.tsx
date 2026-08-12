"use client";

import type { components } from "@metrotrip/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, getAccessToken, setAccessToken } from "./api";
import { legacyApiFetch } from "./legacyApiAdapter";

type UserProfile = components["schemas"]["UserProfile"];
type LoginRequest = components["schemas"]["LoginRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];
export type RegisterInput = RegisterRequest & {
  passwordConfirm: string;
  name: string;
  nickname: string;
  termsAgreed: boolean;
  privacyAgreed: boolean;
  emailVerificationToken: string;
};
type SessionStatus = "loading" | "authenticated" | "anonymous";

type SessionContextValue = {
  status: SessionStatus;
  user: UserProfile | null;
  login: (body: LoginRequest) => Promise<void>;
  register: (body: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
  updateProfile: (displayName: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, newPasswordConfirm: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "error" in error) {
    const envelope = error as {
      error?: {
        code?: string;
        message?: string;
        details?: { errors?: Array<{ loc?: unknown[]; msg?: string }> };
      };
    };
    const code = envelope.error?.code;
    const validationErrors = envelope.error?.details?.errors;
    if (Array.isArray(validationErrors) && validationErrors.length > 0) {
      const labels: Record<string, string> = {
        email: "이메일",
        password: "비밀번호",
        passwordConfirm: "비밀번호 확인",
        name: "이름",
        nickname: "닉네임",
        emailVerificationToken: "이메일 인증",
      };
      return validationErrors
        .map((item) => {
          const field = String(item.loc?.at(-1) ?? "입력값");
          return `${labels[field] ?? field}: ${item.msg ?? "형식을 확인해 주세요."}`;
        })
        .join("\n");
    }
    const known: Record<string, string> = {
      INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
      INVALID_TOKEN: "로그인 세션이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.",
      INVALID_REFRESH_TOKEN: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
      NO_REFRESH_TOKEN: "로그인 세션이 없습니다. 다시 로그인해 주세요.",
      INVALID_VERIFICATION_CODE: "인증코드가 올바르지 않습니다. 가장 최근에 받은 코드를 입력해 주세요.",
      VERIFICATION_EXPIRED: "인증코드가 만료되었습니다. 인증코드를 다시 요청해 주세요.",
      EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
      NICKNAME_ALREADY_EXISTS: "이미 사용 중인 닉네임입니다.",
      VALIDATION_ERROR: "입력값을 확인해 주세요.",
      ADMIN_ONLY: "관리자만 사용할 수 있는 기능입니다.",
      HTTP_401: "로그인이 필요하거나 로그인 세션이 만료되었습니다.",
      HTTP_403: "이 기능을 사용할 권한이 없습니다.",
      HTTP_404: "요청한 정보를 찾을 수 없습니다.",
      HTTP_409: "이미 처리된 요청입니다.",
      HTTP_422: "입력값 형식을 확인해 주세요.",
      HTTP_500: "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      HTTP_503: "현재 등록·수정 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    };
    if (code && known[code]) return known[code];
    if (envelope.error?.message) return code ? `${envelope.error.message} (${code})` : envelope.error.message;
  }
  return "요청을 처리하지 못했습니다.";
}

export class SessionRequestError extends Error {}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [refreshAfterSeconds, setRefreshAfterSeconds] = useState<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  const applyAuth = useCallback((data: components["schemas"]["AuthResponse"]) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = (async () => {
      try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("session refresh timeout")), 8000));
        const { data } = await Promise.race([api.POST("/api/v1/auth/refresh", { body: {} }), timeout]);
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
    })();
    refreshInFlight.current = request;
    try { return await request; }
    finally { if (refreshInFlight.current === request) refreshInFlight.current = null; }
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

  const register = useCallback(async (body: RegisterInput) => {
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

  const updateProfile = useCallback(async (displayName: string, password: string) => {
    const { data, error } = await api.PATCH("/api/v1/me", { body: { displayName, password } });
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

  const changePassword = useCallback(async (currentPassword: string, newPassword: string, newPasswordConfirm: string) => {
    const token = getAccessToken();
    const response = await legacyApiFetch(new Request(`${window.location.origin}/api/v1/me/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new SessionRequestError(errorMessage(payload));
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    setRefreshAfterSeconds(null);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout, refresh, updateProfile, changePassword, deleteAccount }),
    [status, user, login, register, logout, refresh, updateProfile, changePassword, deleteAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
