import { asset } from '../../../shared/lib/asset';
import { Icon } from '../../../shared/ui/Icon';
import { toClock, type RouteSchedule } from '../lib/routeSchedule';
import type { RouteOption } from '../types';

/**
 * 경로 커버 헤더 (docs/SPEC.md 2-2 R5).
 *
 * Wanderlog 의 여행 커버를 참고했다. 배경은 별도 사진을 받지 않고
 * 이미 있는 노선도 이미지를 흐리게 깔아 쓴다.
 *
 * 배경이 `primary` 색이므로 글자는 반드시 `on-primary` 를 쓴다.
 * 두 토큰이 짝이라 라이트·다크 어느 쪽에서도 대비가 유지된다.
 */

type RouteCoverHeaderProps = {
  fromName: string;
  toName: string;
  /** 확정된 경로. 아직 없으면 요약 줄을 숨긴다. */
  option: RouteOption | null;
  /** 확정된 경로의 도착 시각 */
  schedule: RouteSchedule | null;
};

export function RouteCoverHeader({
  fromName,
  toName,
  option,
  schedule,
}: RouteCoverHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-outline-variant shadow-card">
      <div className="absolute inset-0 bg-primary" aria-hidden="true">
        <img
          src={asset('metro-map.png')}
          alt=""
          className="h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />
      </div>

      <div className="relative flex flex-col gap-sm p-[var(--layout-gutter)]">
        <span className="w-fit rounded-full bg-on-primary/20 px-sm py-xs text-label-caps text-on-primary">
          METROTRIP 경로
        </span>

        <h2 className="flex flex-wrap items-center gap-xs text-[var(--content-title-size)] leading-tight font-heading font-bold text-on-primary">
          {fromName}
          <Icon name="arrow_forward" className="text-[28px] opacity-80" />
          {toName}
        </h2>

        {option && (
          <div className="flex flex-wrap items-center gap-md text-body-md text-on-primary/85">
            <span className="flex items-center gap-xs">
              <Icon name="subway" className="text-[18px]" />
              {option.stations.length}개 역
            </span>
            <span className="flex items-center gap-xs">
              <Icon name="swap_calls" className="text-[18px]" />
              환승 {option.transferCount}회
            </span>
            <span className="flex items-center gap-xs">
              <Icon name="schedule" className="text-[18px]" />
              {schedule
                ? `${toClock(schedule.arrivals.at(-1)!).text} 도착 · ${schedule.totalMinutes}분`
                : `예상 ${option.estimatedMinutes}분`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
