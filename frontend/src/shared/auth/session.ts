import { useEffect, useState } from 'react';
import type { AuthTokens } from '../../features/auth/types';

const ACCESS_TOKEN_KEY = 'metrotrip-access-token';
const REFRESH_TOKEN_KEY = 'metrotrip-refresh-token';
const AUTH_CHANGED_EVENT = 'metrotrip-auth-changed';

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveAuthTokens(tokens: AuthTokens) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  notifyAuthChanged();
}

export function clearAuthSession() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  notifyAuthChanged();
}

export function useIsAuthenticated() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAccessToken()));

  useEffect(() => {
    const sync = () => setAuthenticated(Boolean(getAccessToken()));
    window.addEventListener('storage', sync);
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
    };
  }, []);

  return authenticated;
}
