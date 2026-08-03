import { useEffect, useState } from 'react';
import { getStations } from '../../api/stations';
import type { Station } from '../../types/station';
import { PreviewFrame } from '../Preview/PreviewFrame';
import { MetroMapPanel } from './MetroMapPanel';

type LineMapViewProps = {
  selected: Station | null;
  /** 역을 고르면 지도 화면으로 넘어간다 */
  onSelect: (station: Station) => void;
};

/**
 * 노선도 프리뷰 (docs/SPEC.md 2-1).
 *
 * stations.json의 배열 순서가 곧 노선상 실제 순서다
 * (성환 → 신창, 남쪽 방향으로 좌표가 단조 감소한다).
 * 그래서 별도의 order 필드 없이 배열 순서를 그대로 쓴다.
 */
export function LineMapView({ selected, onSelect }: LineMapViewProps) {
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    let cancelled = false;
    getStations().then((result) => {
      if (!cancelled) setStations(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PreviewFrame
      title="노선도"
      description="노선 위에서 역을 골라 바로 지도로 이동합니다."
      notice="아래 노선도는 화면 확인용입니다. 역을 눌러 지도로 이동하는 것은 천안·아산 구간에서만 동작합니다."
      wide
    >
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
          1호선 · 천안 ~ 아산 구간
        </h3>

        {/* 역이 11개라 좁은 화면에서는 가로로 스크롤한다 */}
        <div className="overflow-x-auto">
          {/* 45도로 눕힌 역명이 아래로 삐져나오므로 하단 여백을 넉넉히 준다 (가장 긴 역명 기준) */}
          <div className="min-w-[620px] px-sm pb-[3.5rem] pt-lg">
            <div className="relative h-1 rounded-full bg-primary" />
            <div className="flex justify-between">
              {stations.map((station) => {
                const isActive = selected?.name === station.name;
                return (
                  <button
                    key={station.name}
                    type="button"
                    onClick={() => onSelect(station)}
                    title={`${station.name}으로 이동`}
                    className="group relative flex w-6 flex-col items-center"
                  >
                    <span
                      className={
                        isActive
                          ? 'z-10 -mt-[9px] h-4 w-4 rounded-full border-4 border-primary bg-primary ring-4 ring-primary-container'
                          : 'z-10 -mt-[9px] h-4 w-4 rounded-full border-4 border-primary bg-surface-container-lowest transition-colors group-hover:bg-primary-container'
                      }
                    />
                    <span
                      className={
                        isActive
                          ? 'absolute top-3 origin-top-left rotate-45 whitespace-nowrap text-body-md font-bold text-primary'
                          : 'absolute top-3 origin-top-left rotate-45 whitespace-nowrap text-body-md text-on-surface-variant'
                      }
                    >
                      {station.name.replace(/역$/, '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-md">
        <h3 className="mb-sm text-label-caps uppercase tracking-widest text-on-surface-variant">
          수도권 전체 노선도
        </h3>
        <MetroMapPanel />
      </section>
    </PreviewFrame>
  );
}
