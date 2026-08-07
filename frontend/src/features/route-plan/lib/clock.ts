/**
 * 시각 변환 유틸리티 (docs/SPEC.md 2-2).
 *
 * `routeSchedule.ts` 와 `resolveSchedule.ts` 양쪽이 이 함수들을 쓴다.
 * 예전에는 `routeSchedule.ts` 안에 있었는데, `resolveSchedule.ts` 가
 * 그걸 import 하고 `routeSchedule.ts` 는 다시 `resolveSchedule.ts` 를
 * import 하는 **순환 참조**가 생겨 있었다. 번들 시점에 따라
 * `MINUTES_PER_TRANSFER is not defined` 처럼 엉뚱한 참조 오류로 터진다.
 * 의존성이 없는 별도 파일로 빼서 순환을 끊는다.
 */

/** "HH:MM" 을 자정 기준 분으로 바꾼다. 형식이 어긋나면 null. */
export function toMinutes(clock: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!matched) return null;

  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** 자정 기준 분을 "HH:MM" 으로 바꾼다. 24시를 넘으면 다음날로 표시한다. */
export function toClock(minutes: number): { text: string; nextDay: boolean } {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);

  return {
    text: `${String(hours).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
    nextDay: minutes >= 1440,
  };
}

/** 지금 시각을 "HH:MM" 으로 반환한다. 출발 시각 기본값에 쓴다. */
export function currentClock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
