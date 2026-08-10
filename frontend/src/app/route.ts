import type { ViewId } from './view';

export type AppRoute = {
  view: ViewId;
  stationName: string | null;
  authPage: AuthPage | null;
  reviewPage: ReviewPage | null;
  communityPage: CommunityPage | null;
};

export type ReviewPage =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'detail'; reviewId: number }
  | { kind: 'edit'; reviewId: number };

export type AuthPage = 'login' | 'signup' | 'password-reset';

export type CommunityPage =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'detail'; postId: number }
  | { kind: 'edit'; postId: number };

const PATH_BY_VIEW: Record<ViewId, string> = {
  line: '/',
  map: '/map',
  route: '/route',
  community: '/community',
  mypage: '/mypage',
};

const VIEW_BY_PATH: Record<string, ViewId> = {
  '/': 'line',
  '/map': 'map',
  '/route': 'route',
  '/community': 'community',
  '/mypage': 'mypage',
};

const AUTH_PAGE_BY_PATH: Record<string, AuthPage> = {
  '/login': 'login',
  '/signup': 'signup',
  '/password-reset': 'password-reset',
};

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '');

export function readRoute(location: Location = window.location): AppRoute {
  const appPath = location.pathname.startsWith(BASE_PATH)
    ? location.pathname.slice(BASE_PATH.length)
    : location.pathname;
  const normalizedPath = appPath.replace(/\/$/, '') || '/';
  const authPage = AUTH_PAGE_BY_PATH[normalizedPath] ?? null;
  const view = VIEW_BY_PATH[normalizedPath] ?? 'line';
  const stationName = new URLSearchParams(location.search).get('station');
  let reviewPage: ReviewPage | null = null;
  let communityPage: CommunityPage | null = null;
  if (normalizedPath === '/reviews') reviewPage = { kind: 'list' };
  if (normalizedPath === '/reviews/new') reviewPage = { kind: 'create' };
  const reviewMatch = normalizedPath.match(/^\/reviews\/(\d+)(\/edit)?$/);
  if (reviewMatch) {
    reviewPage = {
      kind: reviewMatch[2] ? 'edit' : 'detail',
      reviewId: Number(reviewMatch[1]),
    };
  }
  if (normalizedPath === '/community') communityPage = { kind: 'list' };
  if (normalizedPath === '/community/new') communityPage = { kind: 'create' };
  const communityMatch = normalizedPath.match(/^\/community\/(\d+)(\/edit)?$/);
  if (communityMatch) {
    communityPage = {
      kind: communityMatch[2] ? 'edit' : 'detail',
      postId: Number(communityMatch[1]),
    };
  }
  return { view: communityPage ? 'community' : view, stationName, authPage, reviewPage, communityPage };
}

export function getPath(view: ViewId, stationName?: string): string {
  const targetPath = `${BASE_PATH}${PATH_BY_VIEW[view]}` || '/';
  if (view !== 'map' || !stationName) return targetPath;
  return `${targetPath}?station=${encodeURIComponent(stationName)}`;
}

export function getAuthPath(page: AuthPage): string {
  return `${BASE_PATH}/${page}`;
}

export function getReviewPath(page: ReviewPage): string {
  if (page.kind === 'list') return `${BASE_PATH}/reviews`;
  if (page.kind === 'create') return `${BASE_PATH}/reviews/new`;
  return `${BASE_PATH}/reviews/${page.reviewId}${page.kind === 'edit' ? '/edit' : ''}`;
}

export function getCommunityPath(page: CommunityPage): string {
  if (page.kind === 'list') return `${BASE_PATH}/community`;
  if (page.kind === 'create') return `${BASE_PATH}/community/new`;
  return `${BASE_PATH}/community/${page.postId}${page.kind === 'edit' ? '/edit' : ''}`;
}

export function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
