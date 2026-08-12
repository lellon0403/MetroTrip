import type { components } from "@metrotrip/contracts";
import { ArrowLeft, MapPinned } from "lucide-react";
import Link from "next/link";

type PlanView = components["schemas"]["PlanView"];

function ymd(value: unknown) {
  const text = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

export function SharedPlanView({ plan, mapHref, backHref }: { plan: PlanView; mapHref?: string; backHref?: string }) {
  return <main className="sharedPlan contentShell">
    {backHref ? <Link className="backLink" href={backHref}><ArrowLeft size={16} aria-hidden /> 모집글로 돌아가기</Link> : null}
    <header>
      <p className="eyebrow">UNLISTED TRIP · 읽기 전용</p><h1>{plan.title}</h1><p>{ymd(plan.startDate)} – {ymd(plan.endDate)}</p>
      <div className="dataNotice">로그인 없이 볼 수 있는 읽기 전용 일정입니다. 원본 일정은 수정할 수 없습니다.</div>
      {mapHref ? <Link className="primaryButton sharedMapButton" href={mapHref}><MapPinned size={17} aria-hidden /> 지도에서 보기</Link> : null}
    </header>
    <div className="sharedDays">{plan.days.map((day, index) => <article key={day.id}><aside><span>DAY {index + 1}</span><strong>{day.title ?? `${index + 1}일차`}</strong><time>{ymd(day.dayDate)}</time></aside><ol>{day.items.map((item) => <li key={item.id}><small>{item.itemType}</small><strong>{item.note ?? (item.itemType === "PLACE" ? "여행 장소" : item.itemType === "STATION" ? "이동 역" : "저장된 경로")}</strong>{item.scheduledTime && <time>{item.scheduledTime.slice(0, 5)}</time>}</li>)}</ol></article>)}</div>
  </main>;
}
