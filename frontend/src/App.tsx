import { useState } from 'react';
import { MapView } from './components/MapView/MapView';
import { StationList } from './components/StationList/StationList';
import { TopNav } from './components/TopNav/TopNav';
import { LineMapView } from './components/LineMap/LineMapView';
import { RoutePlanView } from './components/RoutePlan/RoutePlanView';
import { TimetableView } from './components/Timetable/TimetableView';
import { MyPageView } from './components/MyPage/MyPageView';
import type { Station } from './types/station';
import type { ViewId } from './types/view';

/** 초기 지도 중심: 탕정역 (docs/SPEC.md 6장) */
const INITIAL_STATION: Station = {
  name: '탕정역',
  lat: 36.78825,
  lng: 127.084417,
  line: '1호선',
};

function App() {
  const [selected, setSelected] = useState<Station>(INITIAL_STATION);
  const [view, setView] = useState<ViewId>('map');

  /** 역을 고르면 어느 화면에서 골랐든 지도로 돌아온다 */
  const selectStation = (station: Station) => {
    setSelected(station);
    setView('map');
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-on-background">
      <TopNav current={view} onNavigate={setView} />

      <main className="relative flex-1 overflow-hidden">
        {/*
          지도는 항상 붙여 둔다.
          숨겼다 되살리면 컨테이너 크기가 0이 되는 시점이 생겨 지도가 깨지므로,
          다른 화면은 지도 위에 덮는 방식으로 처리한다.
        */}
        <div className="absolute inset-0">
          <MapView
            lat={selected.lat}
            lng={selected.lng}
            stationName={selected.name}
          />
        </div>

        {view === 'map' && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-full flex-col p-md sm:w-72">
            <div className="pointer-events-auto flex min-h-0 flex-1 flex-col">
              <StationList selected={selected} onSelect={selectStation} />
            </div>
          </div>
        )}

        {/* 지도의 확대/축소 컨트롤이 z-30이라, 덮는 화면은 그보다 위(z-40)에 둔다 */}
        {view !== 'map' && (
          <div className="absolute inset-0 z-40 bg-background">
            {view === 'line' && (
              <LineMapView selected={selected} onSelect={selectStation} />
            )}
            {view === 'route' && <RoutePlanView />}
            {view === 'timetable' && <TimetableView />}
            {view === 'mypage' && <MyPageView />}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
