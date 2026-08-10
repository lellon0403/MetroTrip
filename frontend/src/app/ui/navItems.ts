import type { ViewId } from '../view';

export type NavItem = {
  icon: string;
  label: string;
  view: ViewId;
};

export const NAV_ITEMS: NavItem[] = [
  { icon: 'map', label: '지도', view: 'map' },
  { icon: 'directions_subway', label: '노선', view: 'line' },
  { icon: 'route', label: '경로', view: 'route' },
  { icon: 'groups', label: '모집', view: 'community' },
  { icon: 'person', label: '마이페이지', view: 'mypage' },
];
