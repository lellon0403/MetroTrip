import { cn } from '../../../shared/lib/cn';
import { Icon } from '../../../shared/ui/Icon';
import { SectionHeader } from '../../../shared/ui/SectionHeader';
import { toClock, type RouteSchedule } from '../lib/routeSchedule';
import type { RouteOption, RouteOptionKind } from '../types';

/**
 * 최소 시간·최소 환승 비교 (docs/SPEC.md 2-2 R2).
 *
 * 지금 노선 데이터가 1호선 하나뿐이라 두 방식의 결과가 같게 나온다.
 * 그때는 카드를 하나만 보여주고 이유를 함께 알린다.
 */

const LABEL: Record<RouteOptionKind, string> = {
  fastest: '최소 시간',
  fewestTransfers: '최소 환승',
};

const DESCRIPTION: Record<RouteOptionKind, string> = {
  fastest: '가장 빨리 도착하는 경로',
  fewestTransfers: '갈아타는 횟수가 가장 적은 경로',
};

type RouteOptionCardsProps = {
  options: RouteOption[];
  selectedKind: RouteOptionKind | null;
  onSelect: (kind: RouteOptionKind) => void;
  /** 안별 도착 시각. 비교 기준이 된다. */
  schedules: Map<RouteOptionKind, RouteSchedule>;
};

export function RouteOptionCards({
  options,
  selectedKind,
  onSelect,
  schedules,
}: RouteOptionCardsProps) {
  if (options.length === 0) return null;

  return (
    <section className="flex flex-col gap-sm">
      <SectionHeader
        eyebrow="경로 선택"
        title="어떤 기준으로 갈까요?"
        description={
          options.length === 1
            ? '이 구간은 노선이 하나뿐이라 최소 시간과 최소 환승 결과가 같습니다.'
            : '두 경로를 비교하고 하나를 고르세요.'
        }
      />

      <div className="grid gap-sm sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = option.kind === selectedKind;
          const schedule = schedules.get(option.kind);
          const arrival = schedule ? toClock(schedule.arrivals.at(-1)!) : null;
          return (
            <button
              key={option.kind}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option.kind)}
              className={cn(
                'flex flex-col gap-sm rounded-xl border p-md text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary-container/40 shadow-card'
                  : 'border-outline-variant bg-surface-bright hover:border-primary/40',
              )}
            >
              <div className="flex items-center justify-between gap-sm">
                <span className="text-headline-sm font-heading text-on-surface">
                  {LABEL[option.kind]}
                </span>
                {isSelected && (
                  <Icon
                    name="check_circle"
                    filled
                    className="text-[20px] text-primary"
                  />
                )}
              </div>

              <p className="text-body-md text-on-surface-variant">
                {DESCRIPTION[option.kind]}
              </p>

              {/* 비교 기준 — 목적지에 몇 시에 닿는지를 가장 크게 보여준다 */}
              {arrival && schedule && (
                <p className="flex items-baseline gap-xs">
                  <span className="text-body-md text-on-surface-variant">
                    {schedule.fromTimetable ? '도착' : '도착 예상'}
                  </span>
                  <span className="font-mono text-headline-sm font-bold text-primary">
                    {arrival.text}
                  </span>
                  {arrival.nextDay && (
                    <span className="text-body-md text-on-surface-variant">
                      다음날
                    </span>
                  )}
                </p>
              )}

              <dl className="flex flex-wrap gap-md text-body-md text-on-surface">
                <div className="flex items-center gap-xs">
                  <dt className="text-on-surface-variant">정차</dt>
                  <dd className="font-semibold">{option.stations.length}개 역</dd>
                </div>
                <div className="flex items-center gap-xs">
                  <dt className="text-on-surface-variant">환승</dt>
                  <dd className="font-semibold">{option.transferCount}회</dd>
                </div>
                <div className="flex items-center gap-xs">
                  <dt className="text-on-surface-variant">소요</dt>
                  <dd className="font-semibold">
                    {schedule?.totalMinutes ?? option.estimatedMinutes}분
                  </dd>
                </div>
              </dl>

              {schedule?.trainNos.length ? (
                <p className="text-body-md text-on-surface-variant">
                  열차 {schedule.trainNos.join(' → ')}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
