import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from './Card';
import { Icon } from './Icon';

type PreviewFrameProps = {
  title: string;
  description: string;
  notice?: string;
  wide?: boolean;
  contentWidth?: 'default' | 'board';
  children: ReactNode;
};

export function PreviewFrame({ title, description, notice, wide = false, contentWidth = 'default', children }: PreviewFrameProps) {
  return (
    <div className="responsive-frame h-full overflow-y-auto bg-background">
      <div className={cn(
        'responsive-frame-content flex flex-col gap-[var(--layout-gap)] p-[var(--layout-gutter)]',
        wide ? 'w-full' : contentWidth === 'board' ? 'mx-auto w-full max-w-[var(--board-content-width)]' : 'mx-auto max-w-4xl',
      )}>
        <header className="responsive-frame-header flex flex-col gap-sm pt-xs sm:pt-sm">
          <span className="w-fit rounded-full bg-primary-container px-sm py-xs text-label-caps text-on-primary-container">METROTRIP</span>
          <div>
            <h2 className="text-[var(--content-title-size)] leading-tight font-heading text-on-surface">{title}</h2>
            <p className="mt-xs max-w-2xl text-[var(--content-description-size)] leading-6 text-on-surface-variant">{description}</p>
          </div>
        </header>

        {notice && <Card className="responsive-frame-notice flex items-start gap-sm border-tertiary/25 bg-tertiary-container/10 p-md shadow-none">
          <Icon name="info" className="mt-[2px] shrink-0 text-[19px] text-tertiary" />
          <p className="text-body-md text-on-surface-variant">{notice}</p>
        </Card>}

        {children}
      </div>
    </div>
  );
}
