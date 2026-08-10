import assert from "node:assert/strict";
import test from "node:test";

import { dateInSeoul as mobileDateInSeoul } from "../apps/mobile/src/lib/date.ts";
import { nearestByCoordinate } from "../apps/mobile/src/lib/geo.ts";
import { addCalendarDays, dateInSeoul as webDateInSeoul } from "../apps/web/src/lib/date.ts";

test("Web과 Mobile은 서울 기준 달력 날짜를 사용한다", () => {
  const afterMidnightInSeoul = new Date("2026-08-08T15:30:00Z");
  assert.equal(webDateInSeoul(afterMidnightInSeoul), "2026-08-09");
  assert.equal(mobileDateInSeoul(afterMidnightInSeoul), "2026-08-09");
});

test("일정 날짜 추가는 월·연도 경계를 보존한다", () => {
  assert.equal(addCalendarDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
});

test("현재 위치에서 가장 가까운 역과 거리를 계산한다", () => {
  const nearest = nearestByCoordinate(
    { latitude: 36.8, longitude: 127.1 },
    [
      { id: "far", latitude: 37, longitude: 127.2 },
      { id: "near", latitude: 36.81, longitude: 127.11 },
    ],
  );
  assert.equal(nearest?.item.id, "near");
  assert.ok((nearest?.distanceMeters ?? 0) > 0);
});

test("후보 역이 없으면 최근접 결과도 없다", () => {
  assert.equal(nearestByCoordinate({ latitude: 36.8, longitude: 127.1 }, []), null);
});
