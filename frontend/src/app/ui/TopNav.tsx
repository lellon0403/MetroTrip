import { useState } from 'react';
import { asset } from '../../shared/lib/asset';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { ViewId } from '../view';
import { NAV_ITEMS } from './navItems';
import { getReviewPath, navigate } from '../route';

const LOGO_IMAGE = 'logo.png';

type TopNavProps = {
  current: ViewId;
  reviewActive: boolean;
  isAuthenticated: boolean;
  onNavigate: (view: ViewId) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export function TopNav({ current, reviewActive, isAuthenticated, onNavigate, theme, onToggleTheme }: TopNavProps) {
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <header className="app-top-nav fixed inset-x-0 bottom-0 z-50 flex h-16 shrink-0 items-center gap-sm border-t border-outline-variant/70 bg-surface-bright/95 px-sm shadow-[0_-8px_24px_rgb(29_37_44_/_8%)] backdrop-blur-xl lg:inset-y-0 lg:left-0 lg:right-auto lg:h-dvh lg:w-20 lg:flex-col lg:gap-md lg:border-r lg:border-t-0 lg:px-sm lg:py-md lg:shadow-sm">
      <div className="hidden shrink-0 items-center gap-xs pr-sm lg:flex lg:pr-0">
        {logoMissing ? (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-primary">
              <Icon name="subway" />
            </span>
            <span className="text-headline-sm font-heading font-bold text-on-surface lg:hidden">MetroTrip</span>
          </>
        ) : (
          <img
            src={asset(LOGO_IMAGE)}
            alt="MetroTrip"
            className="h-8 w-auto max-w-[110px] object-contain sm:h-9 sm:max-w-[150px] lg:h-auto lg:w-14"
            onError={() => setLogoMissing(true)}
          />
        )}
      </div>

      <nav className="flex min-w-0 flex-1 items-center justify-around gap-xs overflow-x-auto lg:w-full lg:flex-col lg:items-stretch lg:justify-start lg:overflow-visible">
        {NAV_ITEMS.filter((item) => item.view !== 'mypage').map((item) => {
          const isCurrent = item.view === current && !reviewActive;
          return (
          <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-label={item.label}
              aria-current={isCurrent ? 'page' : undefined}
              className={`flex h-14 min-w-14 flex-1 shrink-0 flex-col items-center justify-center gap-px rounded-xl px-xs text-center text-[11px] leading-tight transition-all lg:h-auto lg:min-w-0 lg:flex-none lg:gap-xs lg:px-xs lg:py-sm lg:text-body-md ${
                isCurrent
                  ? 'bg-primary-container font-bold text-on-primary-container shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              }`}
            >
              <Icon name={item.icon} className="text-[20px]" />
              <span className="block lg:text-[11px] lg:leading-tight">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => navigate(getReviewPath({ kind: 'list' }))}
          aria-label="후기"
          aria-current={reviewActive ? 'page' : undefined}
          className={`flex h-14 min-w-14 flex-1 shrink-0 flex-col items-center justify-center gap-px rounded-xl px-xs text-center text-[11px] leading-tight transition-all lg:h-auto lg:min-w-0 lg:flex-none lg:gap-xs lg:px-xs lg:py-sm lg:text-body-md ${reviewActive ? 'bg-primary-container font-bold text-on-primary-container shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`}
        >
          <Icon name="rate_review" className="text-[20px]" />
          <span className="block lg:text-[11px] lg:leading-tight">후기</span>
        </button>
      </nav>

      <button
        type="button"
        onClick={() => onNavigate('mypage')}
        aria-label="留덉씠?섏씠吏"
        aria-current={current === 'mypage' ? 'page' : undefined}
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all lg:h-11 lg:w-11 lg:mt-auto ${
          current === 'mypage'
            ? 'bg-primary-container text-primary shadow-sm'
            : isAuthenticated
              ? 'bg-primary-container text-primary hover:bg-primary/20'
              : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
        }`}
      >
        <Icon name={isAuthenticated ? 'person' : 'person_outline'} className="text-[22px]" />
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        aria-pressed={theme === 'dark'}
        className="shrink-0"
      >
        <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
      </Button>
    </header>
  );
}
