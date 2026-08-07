/**
 * DB 시드 SQL 을 프론트 정적 데이터로 변환한다.
 *
 *   node scripts/convertSeed.mjs
 *
 * 백엔드 API 가 붙기 전까지 프론트는 정적 JSON 으로 동작한다.
 * DB 담당이 시드를 갱신하면 이 스크립트를 다시 돌려 JSON 을 맞춘다.
 * (수동으로 JSON 을 고치지 말 것 — 다음 갱신 때 덮어써진다)
 *
 * 만드는 파일:
 *   src/shared/data/stations.json               역명·좌표·노선
 *   src/features/route-plan/data/lineOrder.json  노선별 역 순서
 *   src/features/route-plan/data/timetables.json 열차 시간표
 *   src/features/station-map/data/places.json    역 주변 장소
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '../../db/seed');
const read = (file) => readFileSync(join(seedDir, file), 'utf8');

/**
 * `INSERT ... VALUES` 뒤의 튜플들을 뽑는다. 줄 끝 주석(-- ...)은 버린다.
 *
 * 컬럼 목록이 `INSERT INTO x\n  (col1, col2)\nVALUES` 처럼 따로 줄을 차지하는
 * 파일이 있다(seed_05, seed_08). 그 줄도 `(` 로 시작해서 데이터 행처럼 걸린다.
 * 컬럼 목록은 식별자·쉼표뿐이라 숫자도 따옴표도 없으므로, 그런 행만 걸러낸다.
 */
function parseTuples(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, '').trim())
    .filter((line) => line.startsWith('('))
    .filter((line) => !/^\([a-zA-Z_,\s]+\)[,;]?$/.test(line))
    .map((line) => {
      const inner = line.slice(1, line.lastIndexOf(')'));
      // 따옴표 안의 쉼표는 건드리지 않고 최상위 쉼표로만 자른다.
      const parts = [];
      let current = '';
      let quoted = false;
      for (const char of inner) {
        if (char === "'") quoted = !quoted;
        if (char === ',' && !quoted) {
          parts.push(current);
          current = '';
          continue;
        }
        current += char;
      }
      parts.push(current);
      return parts.map((part) => part.trim().replace(/^'|'$/g, '').trim());
    });
}

/**
 * DB 는 '탕정' 으로 저장하지만, 화면과 기존 데이터(장소·노선도 좌표)는
 * '탕정역' 형식을 쓴다. 여기서 맞춰 준다.
 * '서울역' 처럼 이미 '역' 으로 끝나면 그대로 둔다.
 */
const withSuffix = (name) => (name.endsWith('역') ? name : `${name}역`);

// ── 노선 ────────────────────────────────────────────────────────────
// (line_id, line_name, line_number, display_order)
const lineNameById = new Map(
  parseTuples(read('seed_02_subway_lines.sql')).map((row) => [row[0], row[1]]),
);

// ── 역 ──────────────────────────────────────────────────────────────
// (station_id, station_name, latitude, longitude, address)
const stationById = new Map(
  parseTuples(read('seed_03_stations.sql')).map((row) => [
    row[0],
    { name: withSuffix(row[1]), lat: Number(row[2]), lng: Number(row[3]) },
  ]),
);

// ── 노선-역 매핑 ────────────────────────────────────────────────────
// (line_id, station_id, station_order)
const lineOrder = {};
const linesOfStation = new Map();

for (const [lineId, stationId, order] of parseTuples(
  read('seed_04_line_stations.sql'),
)) {
  const line = lineNameById.get(lineId);
  const station = stationById.get(stationId);
  if (!line || !station) continue;

  (lineOrder[line] ??= []).push({ order: Number(order), name: station.name });
  (linesOfStation.get(station.name) ?? linesOfStation.set(station.name, []).get(station.name)).push(line);
}

// station_order 로 정렬해 역 이름만 남긴다.
for (const line of Object.keys(lineOrder)) {
  lineOrder[line] = lineOrder[line]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.name);
}

// ── 시간표 ──────────────────────────────────────────────────────────
// (train_no, line_id, station_id, day_type, direction, arrival_time, departure_time, destination_station_id)
const timetables = parseTuples(read('seed_08_train_timetables.sql'))
  .map((row) => {
    const station = stationById.get(row[2]);
    const destination = stationById.get(row[7]);
    const line = lineNameById.get(row[1]);
    if (!station || !line) return null;
    // 시발역은 arrival_time 이, 종착역은 departure_time 이 NULL 이다.
    // 그 역에 열차가 있는 시각으로는 남은 쪽을 쓴다.
    const time = row[5] !== 'NULL' ? row[5] : row[6];
    if (!time || time === 'NULL') return null;

    return {
      trainNo: row[0],
      line,
      stationName: station.name,
      dayType: row[3],
      direction: row[4],
      // "HH:MM:SS" 에서 초는 버린다. 화면에 분 단위로만 쓴다.
      arrivalTime: time.slice(0, 5),
      destination: destination?.name ?? null,
    };
  })
  .filter(Boolean);

// ── 장소 ────────────────────────────────────────────────────────────
// (place_id, place_name, category, description, address, latitude, longitude, phone, created_by)
//
// DB category(TourAPI 원본) -> 프론트 코드. FD6/CE7/AT4 는 카카오 로컬 코드와
// 겹쳐서 기존 아이콘·마커색을 그대로 쓰고, SHOPPING/ETC 는 대응이 없어 새로 뒀다
// (frontend/src/features/station-map/types.ts 참고).
const PLACE_CATEGORY = {
  RESTAURANT: 'FD6',
  CAFE: 'CE7',
  TOUR: 'AT4',
  SHOPPING: 'SHOPPING',
  ETC: 'ETC',
};
const CATEGORY_NAME = {
  FD6: '음식점',
  CE7: '카페',
  AT4: '관광명소',
  SHOPPING: '쇼핑',
  ETC: '기타',
};

const placeById = new Map(
  parseTuples(read('seed_05_places.sql')).map((row) => [
    row[0],
    {
      id: `db-${row[0]}`,
      name: row[1],
      category: PLACE_CATEGORY[row[2]] ?? 'ETC',
      address: row[4],
      lat: Number(row[5]),
      lng: Number(row[6]),
    },
  ]),
);

// (place_id, station_id)
const placesByStation = {};
for (const [placeId, stationId] of parseTuples(read('seed_06_place_stations.sql'))) {
  const place = placeById.get(placeId);
  const station = stationById.get(stationId);
  if (!place || !station) continue;

  (placesByStation[station.name] ??= []).push({
    ...place,
    categoryName: CATEGORY_NAME[place.category],
  });
}

// ── 역 목록 ─────────────────────────────────────────────────────────
// 같은 역이 여러 노선에 속하면 대표 노선 하나만 적는다.
// 환승 판정은 lineOrder 로 하므로 이 값은 표시용이다.
const stations = [...stationById.values()].map((station) => ({
  name: station.name,
  lat: station.lat,
  lng: station.lng,
  line: linesOfStation.get(station.name)?.[0] ?? '1호선',
}));

const write = (relative, data) => {
  writeFileSync(join(here, '..', relative), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  ${relative}`);
};

console.log('생성:');
write('src/shared/data/stations.json', stations);
write('src/features/route-plan/data/lineOrder.json', lineOrder);
write('src/features/route-plan/data/timetables.json', timetables);
write('src/features/station-map/data/places.json', placesByStation);

console.log('\n요약:');
console.log('  역', stations.length, '개');
for (const [line, names] of Object.entries(lineOrder)) {
  console.log(`  ${line}: ${names.length}개 역 (${names[0]} ~ ${names.at(-1)})`);
}
const shared = [...linesOfStation.values()].filter((lines) => lines.length > 1);
console.log('  두 노선에 걸친 역:', shared.length, '개 (환승 가능 지점)');
console.log('  시간표', timetables.length, '건');
console.log(
  '  장소',
  placeById.size,
  '곳 ·',
  Object.keys(placesByStation).length,
  '개 역에 분포',
);
