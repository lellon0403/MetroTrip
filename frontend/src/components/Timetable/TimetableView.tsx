import { PreviewFrame } from '../Preview/PreviewFrame';

/**
 * 화면 구성을 보여주기 위한 가짜 시각이다. 실제 운행 시간표가 아니다.
 * 실제 데이터는 공공데이터포털(코레일) 연동이 필요하다 — docs/SPEC.md 2-1 참고.
 */
const EXAMPLE_ROWS = [
  { hour: '06', minutes: '03  17  31  45', tag: null },
  { hour: '07', minutes: '02  14  26  38  50', tag: null },
  { hour: '08', minutes: '04  18  32  46', tag: '혼잡' },
  { hour: '09', minutes: '03  21  39', tag: null },
  { hour: '…', minutes: '…', tag: null },
  { hour: '23', minutes: '08  36', tag: '막차' },
];

/** 시간표 프리뷰 (docs/SPEC.md 2-1). 역별 시간표 화면 구성만 보여준다. */
export function TimetableView() {
  return (
    <PreviewFrame
      title="시간표"
      description="역을 고르면 상행·하행 열차 시각을 확인합니다."
      notice="아래 시각은 화면 구성을 보여주기 위해 임의로 넣은 값이며, 실제 운행 시각이 아닙니다. 실제 시간표는 공공데이터 연동이 필요합니다."
    >
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant px-md py-sm">
          <span className="text-body-lg font-bold text-on-surface">
            탕정역 시간표
          </span>
          <div className="flex gap-xs rounded-lg border border-outline-variant p-xs">
            <span className="rounded-md bg-primary px-md py-xs text-label-caps text-on-primary">
              상행
            </span>
            <span className="rounded-md px-md py-xs text-label-caps text-on-surface-variant">
              하행
            </span>
          </div>
        </div>

        <ul>
          {EXAMPLE_ROWS.map((row) => (
            <li
              key={row.hour}
              className="flex items-center gap-md border-b border-outline-variant px-md py-sm last:border-b-0"
            >
              <span className="w-10 shrink-0 text-mono-table text-on-surface-variant">
                {row.hour === '…' ? '…' : `${row.hour}시`}
              </span>
              <span className="flex-1 text-mono-table text-on-surface">
                {row.minutes}
              </span>
              {row.tag && (
                <span className="rounded-md bg-tertiary-container/15 px-sm py-xs text-label-caps text-tertiary">
                  {row.tag}
                </span>
              )}
            </li>
          ))}
        </ul>

        <p className="px-md py-sm text-body-md text-on-surface-variant">
          위 시각은 예시입니다.
        </p>
      </section>
    </PreviewFrame>
  );
}
