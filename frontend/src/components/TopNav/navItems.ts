import type { ViewId } from '../../types/view';

export type NavItem = {
  icon: string;
  label: string;
  view: ViewId;
};

export const NAV_ITEMS: NavItem[] = [
  { icon: 'map', label: '지도', view: 'map' },
  { icon: 'directions_subway', label: '노선', view: 'line' },
  { icon: 'route', label: '경로', view: 'route' },
  { icon: 'schedule', label: '시간표', view: 'timetable' },
  { icon: 'person', label: '마이페이지', view: 'mypage' },
];
