import { Icon } from '../Icon';
import { PreviewFrame } from '../Preview/PreviewFrame';

/** 화면 구성을 보여주기 위한 고정 예시. 실제 계산 결과가 아니다. */
const EXAMPLE = {
  from: '탕정역',
  to: '온양온천역',
  path: ['탕정', '배방', '온양온천'],
};

/** 경로 프리뷰 (docs/SPEC.md 2-1). 출발·도착역을 고르는 화면 구성만 보여준다. */
export function RoutePlanView() {
  return (
    <PreviewFrame
      title="경로"
      description="출발역과 도착역을 골라 지나는 역을 확인합니다."
      notice="아래는 화면 구성을 보여주기 위한 예시입니다. 실제 경로 계산은 아직 동작하지 않습니다."
    >
      <section className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <div className="flex items-center gap-sm rounded-lg border border-outline-variant px-md py-sm">
          <span className="rounded-md bg-primary px-sm py-xs text-label-caps text-on-primary">
            출발
          </span>
          <span className="text-body-lg text-on-surface">{EXAMPLE.from}</span>
        </div>

        <div className="flex justify-end pr-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant">
            <Icon name="swap_vert" className="text-[20px]" />
          </span>
        </div>

        <div className="flex items-center gap-sm rounded-lg border border-outline-variant px-md py-sm">
          <span className="rounded-md bg-secondary px-sm py-xs text-label-caps text-on-secondary">
            도착
          </span>
          <span className="text-body-lg text-on-surface">{EXAMPLE.to}</span>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
          예시 결과
        </h3>
        <p className="mt-xs text-body-lg font-bold text-on-surface">
          온양온천 방향 · 2개 역 이동
        </p>

        <div className="mt-sm flex flex-wrap items-center gap-xs">
          {EXAMPLE.path.map((name, index) => {
            const isEndpoint = index === 0 || index === EXAMPLE.path.length - 1;
            return (
              <span key={name} className="flex items-center gap-xs">
                {index > 0 && (
                  <Icon
                    name="chevron_right"
                    className="text-[18px] text-on-surface-variant"
                  />
                )}
                <span
                  className={
                    isEndpoint
                      ? 'rounded-full bg-primary-container px-md py-xs text-body-md font-bold text-on-primary-container'
                      : 'rounded-full border border-outline-variant px-md py-xs text-body-md text-on-surface-variant'
                  }
                >
                  {name}
                </span>
              </span>
            );
          })}
        </div>
      </section>
    </PreviewFrame>
  );
}
