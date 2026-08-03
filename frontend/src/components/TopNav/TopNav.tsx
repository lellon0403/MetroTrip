import { useState } from 'react';
import { Icon } from '../Icon';
import type { ViewId } from '../../types/view';
import { NAV_ITEMS } from './navItems';
import { asset } from '../../lib/asset';

/** public/ 에 넣어 둔 로고 파일명 */
const LOGO_IMAGE = 'logo.png';

type TopNavProps = {
  current: ViewId;
  onNavigate: (view: ViewId) => void;
};

/**
 * 상단 가로 내비게이션.
 *
 * 원래 좌측 사이드바였는데, 지도 화면을 넓게 쓰려고 상단으로 옮겼다.
 * 좁은 화면에서는 글자를 감추고 아이콘만 남긴다.
 */
export function TopNav({ current, onNavigate }: TopNavProps) {
  // 로고 파일을 아직 넣지 않았으면 원래 쓰던 아이콘 + 글자로 돌아간다
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-md border-b border-outline-variant bg-surface px-md">
      <div className="flex shrink-0 items-center gap-xs">
        {logoMissing ? (
          <>
            <Icon name="subway" className="text-primary" />
            <span className="text-headline-sm font-heading font-extrabold text-primary">
              MetroTrip
            </span>
          </>
        ) : (
          // 로고 안에 이미 이름이 들어 있으므로 글자를 따로 붙이지 않는다
          <img
            src={asset(LOGO_IMAGE)}
            alt="MetroTrip"
            // 로고 여백까지 포함된 이미지라 조금 크게 잡아야 글자가 읽힌다.
            // 좁은 화면에서는 메뉴 자리를 뺏지 않도록 줄인다.
            className="h-8 w-auto max-w-[110px] object-contain sm:h-10 sm:max-w-[170px]"
            onError={() => setLogoMissing(true)}
          />
        )}
      </div>

      {/* 메뉴가 넘치면 페이지가 아니라 메뉴 줄만 옆으로 밀리게 한다 */}
      <nav className="flex min-w-0 flex-1 items-center gap-xs overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isCurrent = item.view === current;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-label={item.label}
              aria-current={isCurrent ? 'page' : undefined}
              className={
                isCurrent
                  ? 'flex shrink-0 items-center gap-xs rounded-xl bg-primary-container px-sm py-xs font-bold text-on-primary-container sm:px-md'
                  : 'flex shrink-0 items-center gap-xs rounded-xl px-sm py-xs text-on-surface-variant transition-colors hover:bg-surface-container-low sm:px-md'
              }
            >
              <Icon name={item.icon} className="text-[20px]" />
              <span className="hidden text-body-md sm:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <p className="hidden shrink-0 text-label-caps uppercase tracking-widest text-on-surface-variant/60 xl:block">
        발표용 MVP · 1호선 천안·아산 구간
      </p>
    </header>
  );
}
