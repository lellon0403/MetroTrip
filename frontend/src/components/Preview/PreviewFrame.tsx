import type { ReactNode } from 'react';
import { Icon } from '../Icon';

type PreviewFrameProps = {
  title: string;
  /** 화면 한 줄 설명 */
  description: string;
  /**
   * 준비중 안내 문구.
   * 발표 중 "이미 되는 기능"으로 오해받지 않도록 화면마다 반드시 밝힌다.
   */
  notice: string;
  /** 노선도처럼 넓게 봐야 하는 화면은 가로 폭 제한을 푼다 */
  wide?: boolean;
  children: ReactNode;
};

/**
 * 발표용 프리뷰 화면의 공통 껍데기 (docs/SPEC.md 2-1).
 *
 * 이 안에 들어가는 화면은 "다음 단계에는 이렇게 만듭니다"를 보여주는 용도이며,
 * 실제로 동작하지 않는다. 그래서 제목 옆 준비중 배지와 안내 문구를 항상 함께 노출한다.
 */
export function PreviewFrame({
  title,
  description,
  notice,
  wide = false,
  children,
}: PreviewFrameProps) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div
        className={
          wide
            ? 'flex flex-col gap-md p-md'
            : 'mx-auto flex max-w-4xl flex-col gap-md p-md'
        }
      >
        <header className="flex flex-col gap-xs">
          <div className="flex items-center gap-sm">
            <h2 className="text-headline-sm font-heading font-bold text-on-surface">
              {title}
            </h2>
            <span className="rounded-full bg-surface-container-high px-sm py-xs text-label-caps uppercase text-on-surface-variant">
              준비중
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant">{description}</p>
        </header>

        <p className="flex items-start gap-sm rounded-xl border border-tertiary-container/30 bg-tertiary-container/10 px-md py-sm text-body-md text-tertiary">
          <Icon name="info" className="shrink-0 text-[20px]" />
          <span>{notice}</span>
        </p>

        {children}
      </div>
    </div>
  );
}
