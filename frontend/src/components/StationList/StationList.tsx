import { useEffect, useState } from 'react';
import { searchStations } from '../../api/stations';
import type { Station } from '../../types/station';
import { Icon } from '../Icon';

type StationListProps = {
  /** 현재 선택된 역 (지도 중심과 동기화) */
  selected: Station | null;
  onSelect: (station: Station) => void;
};

/**
 * 역 검색창 + 목록. 지도 위에 떠 있는 유리 카드(glass-card) 형태.
 * 검색어가 바뀔 때마다 api/stations.ts를 통해 목록을 갱신한다.
 */
export function StationList({ selected, onSelect }: StationListProps) {
  const [keyword, setKeyword] = useState('');
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    let cancelled = false;
    searchStations(keyword).then((result) => {
      if (!cancelled) setStations(result);
    });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  return (
    <div className="flex h-full flex-col gap-sm">
      {/* 검색창 */}
      <div className="flex items-center gap-sm rounded-xl border border-outline-variant bg-white/80 p-sm pr-md shadow-lg backdrop-blur-md">
        <Icon name="search" className="px-sm text-primary" />
        <input
          className="w-full border-none bg-transparent text-body-md placeholder:text-on-surface-variant focus:outline-none"
          type="text"
          placeholder="역 이름 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 역 목록 카드 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-outline-variant bg-white/80 shadow-lg backdrop-blur-md">
        <div className="border-b border-outline-variant px-md py-sm">
          <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
            역 목록 · 1호선
          </h3>
        </div>

        <ul className="flex-1 space-y-xs overflow-y-auto p-sm">
          {stations.map((station) => {
            const isActive = selected?.name === station.name;
            return (
              <li key={station.name}>
                <button
                  type="button"
                  onClick={() => onSelect(station)}
                  className={
                    isActive
                      ? 'flex w-full items-center justify-between gap-sm rounded-lg border-l-4 border-primary bg-primary/5 px-sm py-xs text-left transition-colors'
                      : 'flex w-full items-center justify-between gap-sm rounded-lg border-l-4 border-transparent px-sm py-xs text-left transition-colors hover:bg-surface-container-low'
                  }
                >
                  <span
                    className={
                      isActive
                        ? 'text-body-lg font-bold text-primary'
                        : 'text-body-md text-on-surface'
                    }
                  >
                    {station.name}
                  </span>
                  <span className="rounded-full bg-primary px-sm text-label-caps text-white">
                    {station.line}
                  </span>
                </button>
              </li>
            );
          })}

          {stations.length === 0 && (
            <li className="px-md py-sm text-body-md text-on-surface-variant">
              검색 결과가 없습니다.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
