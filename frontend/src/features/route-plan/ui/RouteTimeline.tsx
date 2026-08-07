import { useEffect, useState } from 'react';
import { cn } from '../../../shared/lib/cn';
import { Badge } from '../../../shared/ui/Badge';
import { Icon } from '../../../shared/ui/Icon';
import { SectionHeader } from '../../../shared/ui/SectionHeader';
import { getPlacesByStation } from '../../station-map/api/places';
import type { Place, PlaceLoadStatus } from '../../station-map/types';
import { toClock, type RouteSchedule } from '../lib/routeSchedule';
import type { RouteOption } from '../types';

/**
 * 경유역 타임라인 (docs/SPEC.md 2-2 R3·R4).
 *
 * 확정한 경로의 역을 순서대로 펼치고, 역을 누르면 그 역 주변 장소를 보여준다.
 * 장소 데이터는 지도 화면과 같은 접근 계층(`station-map/api/places.ts`)을 쓴다.
 *
 * 아이콘 매핑은 지도 쪽 `PlaceList` 와 겹치지만, 그쪽은 지도 패널 레이아웃에
 * 맞춰져 있어 그대로 쓰기 어렵다. 목록 모양이 서로 달라 따로 둔다.
 */

const CATEGORY_ICON: Record<Place['category'], string> = {
  FD6: 'restaurant',
  CE7: 'local_cafe',
  AT4: 'park',
  SW8: 'subway',
  SHOPPING: 'storefront',
  ETC: 'place',
};

type RouteTimelineProps = {
  option: RouteOption;
  /** 역별 도착 시각. 시간표로 계산했는지 여부도 담겨 있다. */
  schedule: RouteSchedule | null;
};

export function RouteTimeline({ option, schedule }: RouteTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<PlaceLoadStatus>('success');

  // 경로가 바뀌면 펼쳐 둔 역을 닫는다.
  useEffect(() => {
    setExpanded(null);
  }, [option]);

  useEffect(() => {
    if (!expanded) return;

    let alive = true;
    setStatus('loading');

    getPlacesByStation(expanded)
      .then((found) => {
        if (!alive) return;
        setPlaces(found);
        setStatus('success');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [expanded]);

  const departure = schedule?.arrivals[0] ?? null;

  // 노선이 바뀌는 지점 = 환승역. 구간(leg)의 첫 역이 환승역이다.
  const transferAt = new Map<string, { from: string; to: string }>();
  option.legs.forEach((leg, index) => {
    if (index === 0) return;
    transferAt.set(leg.stations[0].name, {
      from: option.legs[index - 1].line,
      to: leg.line,
    });
  });

  return (
    <section className="flex flex-col gap-sm">
      <SectionHeader
        eyebrow="가는 길"
        title="어디서 내려볼까요?"
        description="역을 누르면 그 역 주변에 들를 만한 곳을 볼 수 있습니다."
        action={<Badge>반경 1km</Badge>}
      />

      <ol className="flex flex-col">
        {option.stations.map((station, index) => {
          const isFirst = index === 0;
          const isLast = index === option.stations.length - 1;
          const isEndpoint = isFirst || isLast;
          const isOpen = expanded === station.name;
          const transfer = transferAt.get(station.name);

          return (
            <li key={station.id} className="relative flex gap-md">
              {/* 세로 레일 — 마지막 역에는 선을 그리지 않는다 */}
              {!isLast && (
                <span
                  className="absolute left-[11px] top-6 h-full w-0.5 bg-outline-variant"
                  aria-hidden="true"
                />
              )}

              <span
                className={cn(
                  'relative z-10 mt-xs h-6 w-6 shrink-0 rounded-full border-4',
                  isEndpoint
                    ? 'border-primary bg-primary'
                    : 'border-outline-variant bg-surface-bright',
                )}
                aria-hidden="true"
              />

              <div className="min-w-0 flex-1 pb-md">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : station.name)}
                  className="flex w-full items-center gap-sm rounded-lg px-sm py-xs text-left hover:bg-surface-container-low"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate',
                        isEndpoint
                          ? 'text-body-lg font-bold text-on-surface'
                          : 'text-body-lg text-on-surface',
                      )}
                    >
                      {station.name}
                    </span>
                    <span className="mt-xs flex flex-wrap items-center gap-xs text-body-md text-on-surface-variant">
                      {isFirst && <Badge>출발</Badge>}
                      {isLast && (
                        <Badge className="bg-secondary-container text-on-secondary-container">
                          도착
                        </Badge>
                      )}
                      {transfer && (
                        <Badge className="bg-tertiary-container/20 text-tertiary">
                          환승 {transfer.from} → {transfer.to}
                        </Badge>
                      )}
                      <span>{station.line}</span>
                    </span>
                  </span>

                  {schedule && departure !== null && (
                    <span className="shrink-0 text-right">
                      <span
                        className="block font-mono text-body-md font-semibold text-on-surface"
                        title={
                          schedule.interpolated[index]
                            ? '이 역은 시간표에 없어 앞뒤 역에서 추정한 시각입니다'
                            : undefined
                        }
                      >
                        {schedule.interpolated[index] && (
                          <span className="text-on-surface-variant">약 </span>
                        )}
                        {toClock(schedule.arrivals[index]).text}
                      </span>
                      {index > 0 && (
                        <span className="block text-body-md text-on-surface-variant">
                          +{schedule.arrivals[index] - departure}분
                        </span>
                      )}
                    </span>
                  )}

                  <Icon
                    name={isOpen ? 'expand_less' : 'expand_more'}
                    className="shrink-0 text-[20px] text-outline"
                  />
                </button>

                {isOpen && (
                  <div className="mt-xs pl-sm">
                    {status === 'loading' ? (
                      <p
                        className="flex items-center gap-xs py-sm text-body-md text-on-surface-variant"
                        role="status"
                      >
                        <Icon
                          name="progress_activity"
                          className="animate-spin text-[18px]"
                        />
                        주변 장소를 불러오는 중입니다.
                      </p>
                    ) : status === 'error' ? (
                      <p
                        className="py-sm text-body-md text-error"
                        role="alert"
                      >
                        주변 장소를 불러오지 못했습니다.
                      </p>
                    ) : places.length === 0 ? (
                      <p className="py-sm text-body-md text-on-surface-variant">
                        아직 등록된 장소가 없습니다.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-xs">
                        {places.map((place) => (
                          <li
                            key={place.id}
                            className="flex items-start gap-sm rounded-xl border border-outline-variant bg-surface-bright p-sm"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-primary">
                              <Icon
                                name={CATEGORY_ICON[place.category]}
                                className="text-[18px]"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-label-caps text-primary">
                                {place.categoryName}
                              </span>
                              <span className="mt-xs block truncate text-body-md font-bold text-on-surface">
                                {place.name}
                              </span>
                              <span className="mt-xs block truncate text-body-md text-on-surface-variant">
                                {place.address}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
