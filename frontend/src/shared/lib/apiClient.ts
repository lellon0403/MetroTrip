import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  saveAuthTokens,
} from '../auth/session';
import type { AuthTokens } from '../../features/auth/types';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
).replace(/\/$/, '');

type ApiErrorBody = {
  code?: string;
  message?: string;
  details?: { errors?: Array<{ loc?: Array<string | number>; msg?: string }> } | null;
};

export class ApiRequestError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    const validation = body?.details?.errors
      ?.map((item) => item.msg)
      .filter(Boolean)
      .join(' / ');
    super([body?.message, validation].filter(Boolean).join(' ') || '요청을 처리하지 못했습니다.');
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function parseBody(response: Response) {
  return (await response.json().catch(() => null)) as ApiErrorBody | null;
}

async function refreshAccessToken(): Promise<AuthTokens | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (response) => {
        const body = await parseBody(response);
        if (!response.ok) return null;
        const tokens = body as unknown as AuthTokens;
        saveAuthTokens(tokens);
        return tokens;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function createHeaders(init: RequestInit, accessToken: string | null) {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

async function send<T>(path: string, init: RequestInit, accessToken: string | null) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: createHeaders(init, accessToken),
  });
  const body = await parseBody(response);
  if (!response.ok) throw new ApiRequestError(response.status, body);
  return body as T;
}

export async function publicApiRequest<T>(path: string, init: RequestInit = {}) {
  return send<T>(path, init, null);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const accessToken = getAccessToken();
  try {
    return await send<T>(path, init, accessToken);
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401 || !getRefreshToken()) {
      throw error;
    }

    // 다른 요청이 먼저 갱신했다면 새 Access Token으로 바로 재시도한다.
    // 이 확인이 없으면 동시 401 응답이 Refresh Token rotation을 연달아 실행할 수 있다.
    const latestAccessToken = getAccessToken();
    if (latestAccessToken && latestAccessToken !== accessToken) {
      return send<T>(path, init, latestAccessToken);
    }

    const tokens = await refreshAccessToken();
    if (!tokens) {
      clearAuthSession();
      throw error;
    }

    return send<T>(path, init, tokens.accessToken).catch((retryError) => {
      if (retryError instanceof ApiRequestError && retryError.status === 401) clearAuthSession();
      throw retryError;
    });
  }
}
