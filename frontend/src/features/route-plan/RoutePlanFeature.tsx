import { Card } from '../../shared/ui/Card';
import { Icon } from '../../shared/ui/Icon';
import { useRoutePlan } from './hooks/useRoutePlan';
import { RouteCoverHeader } from './ui/RouteCoverHeader';
import { RouteDepartureTime } from './ui/RouteDepartureTime';
import { RouteOptionCards } from './ui/RouteOptionCards';
import { RouteStationMap } from './ui/RouteStationMap';
import { RouteTimeline } from './ui/RouteTimeline';

/**
 * 경로 화면 (docs/SPEC.md 2-2).
 *
 * 출발·도착역을 고르면 최소 시간·최소 환승 두 안을 계산해 비교하고,
 * 확정한 경로의 경유역마다 들를 만한 장소를 보여준다.
 *
 * 경로 계산은 지금 프론트가 직접 하지만, 백엔드에 `GET /api/v1/routes` 가 생기면
 * `api/routes.ts` 내부만 교체하면 된다 (docs/BACKEND-HANDOFF.md).
 */
export function RoutePlanFeature() {
  const {
    stations,
    lineOrder,
    fromName,
    toName,
    pickStation,
    swap,
    status,
    result,
    selectedKind,
    setSelectedKind,
    selectedOption,
    routeStationNames,
    departureAt,
    setDepartureAt,
    schedules,
    selectedSchedule,
    stats,
  } = useRoutePlan();

  const hasNoRoute = result !== null && result.options.length === 0;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="responsive-frame-content mx-auto flex max-w-4xl flex-col gap-[var(--layout-gap)] p-[var(--layout-gutter)]">
        <RouteCoverHeader
          fromName={fromName}
          toName={toName}
          option={selectedOption}
          schedule={selectedSchedule}
        />

        <Card className="flex items-start gap-sm border-tertiary/25 bg-tertiary-container/10 p-md shadow-none">
          <Icon
            name="info"
            className="mt-[2px] shrink-0 text-[19px] text-tertiary"
          />
          <p className="text-body-md text-on-surface-variant">
            {selectedSchedule?.fromTimetable ? (
              <>
                도착 시각은{' '}
                <strong className="text-on-surface">실제 열차 시간표</strong>를
                따라 계산했습니다. 타는 열차가 각 역에 서는 시각 그대로입니다.
              </>
            ) : (
              <>
                이 구간은 시간표가 없어{' '}
                <strong className="text-on-surface">
                  역간 {stats.minutesPerHop}분 · 열차 대기 {stats.averageWait}분
                </strong>
                으로 추정한 값입니다.
                {stats.fromTimetable
                  ? ' 이 수치는 실제 시간표에서 뽑았습니다.'
                  : ''}{' '}
                시간표가 있는 구간은 실제 시각으로 표시됩니다.
              </>
            )}
          </p>
        </Card>

        <RouteStationMap
          stations={stations}
          lineOrder={lineOrder}
          fromName={fromName}
          toName={toName}
          routeStationNames={routeStationNames}
          onPick={pickStation}
          onSwap={swap}
        />

        <RouteDepartureTime
          value={departureAt}
          onChange={setDepartureAt}
          schedule={selectedSchedule}
        />

        {status === 'error' ? (
          <Card
            className="flex items-start gap-sm bg-error-container/45 p-md"
            role="alert"
          >
            <Icon name="error_outline" className="text-[20px] text-error" />
            <p className="text-body-md text-error">
              경로를 계산하지 못했습니다.
            </p>
          </Card>
        ) : hasNoRoute ? (
          <Card className="flex items-start gap-sm p-md">
            <Icon
              name="info"
              className="mt-[2px] shrink-0 text-[19px] text-on-surface-variant"
            />
            <p className="text-body-md text-on-surface-variant">
              {fromName === toName
                ? '출발역과 도착역이 같습니다. 다른 역을 골라 주세요.'
                : '두 역을 잇는 경로를 찾지 못했습니다.'}
            </p>
          </Card>
        ) : (
          result && (
            <>
              <RouteOptionCards
                options={result.options}
                selectedKind={selectedKind}
                onSelect={setSelectedKind}
                schedules={schedules}
              />
              {selectedOption && (
                <RouteTimeline
                  option={selectedOption}
                  schedule={selectedSchedule}
                />
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
