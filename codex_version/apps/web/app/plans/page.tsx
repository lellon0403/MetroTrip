"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { addCalendarDays, dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";

type PlanSummary = components["schemas"]["PlanSummary"];
type PlanView = components["schemas"]["PlanView"];
type PlanWriteRequest = components["schemas"]["PlanWriteRequest"];
type Place = components["schemas"]["PlaceSummary"];

function toWriteRequest(plan: PlanView): PlanWriteRequest {
  return {
    title: plan.title,
    description: plan.description,
    startDate: plan.startDate,
    endDate: plan.endDate,
    status: plan.status,
    days: plan.days.map((day) => ({
      dayDate: day.dayDate,
      title: day.title,
      items: day.items.map((item) => ({
        itemType: item.itemType,
        stationId: item.stationId ?? null,
        placeId: item.placeId ?? null,
        routeSnapshot: item.routeSnapshot ?? null,
        note: item.note ?? null,
        scheduledTime: item.scheduledTime ?? null,
        durationMinutes: item.durationMinutes ?? null,
      })),
    })),
  };
}

export default function PlansPage() {
  const { status } = useSession();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [selected, setSelected] = useState<PlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<{ id: string; path: string } | null>(null);
  const [availablePlaces, setAvailablePlaces] = useState<Place[]>([]);
  const [placeChoice, setPlaceChoice] = useState("");

  const loadPlans = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    const { data } = await api.GET("/api/v1/plans", { params: { query: { limit: 50 } } });
    setPlans(data?.items ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    const task = setTimeout(() => void loadPlans(), 0);
    return () => clearTimeout(task);
  }, [loadPlans]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void api.GET("/api/v1/stations", { params: { query: { limit: 1 } } }).then(async ({ data }) => {
      const station = data?.items[0];
      if (!station) return;
      const nearby = await api.GET("/api/v1/places/nearby", { params: { query: { station_id: station.id, radius_meters: 5000, limit: 100 } } });
      setAvailablePlaces(nearby.data?.items ?? []);
      setPlaceChoice(nearby.data?.items[0]?.id ?? "");
    });
  }, [status]);

  async function openPlan(planId: string) {
    setPending(true);
    setError(null);
    const { data } = await api.GET("/api/v1/plans/{plan_id}", { params: { path: { plan_id: planId } } });
    setSelected(data ?? null);
    setPending(false);
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const { data, error: apiError } = await api.POST("/api/v1/plans", {
      body: {
        title: String(form.get("title")),
        description: "MetroTrip에서 만든 여행 일정",
        startDate: date,
        endDate: date,
        status: "DRAFT",
        days: [{ dayDate: date, title: "첫째 날", items: [{ itemType: "NOTE", note: "첫 장소를 추가해 보세요." }] }],
      },
    });
    if (data) {
      setSelected(data);
      setMessage("새 일정이 만들어졌습니다.");
      event.currentTarget.reset();
      await loadPlans();
    } else setError(JSON.stringify(apiError));
    setPending(false);
  }

  function updateTitle(value: string) {
    setSelected((plan) => plan ? { ...plan, title: value } : plan);
  }

  function addNote(dayIndex: number) {
    setSelected((plan) => {
      if (!plan) return plan;
      const days = plan.days.map((day, index) => index === dayIndex ? {
        ...day,
        items: [...day.items, {
          id: crypto.randomUUID(), itemType: "NOTE" as const, note: "새 메모", stationId: null,
          placeId: null, routeSnapshot: null, scheduledTime: null, durationMinutes: null,
          position: day.items.length + 1,
        }],
      } : day);
      return { ...plan, days };
    });
  }

  function updateNote(dayIndex: number, itemIndex: number, note: string) {
    setSelected((plan) => {
      if (!plan) return plan;
      return { ...plan, days: plan.days.map((day, index) => index === dayIndex ? {
        ...day, items: day.items.map((item, position) => position === itemIndex ? { ...item, note } : item),
      } : day) };
    });
  }

  function updateItemTime(dayIndex: number, itemIndex: number, scheduledTime: string) {
    setSelected((plan) => plan ? { ...plan, days: plan.days.map((day, index) => index === dayIndex ? { ...day, items: day.items.map((item, position) => position === itemIndex ? { ...item, scheduledTime: scheduledTime || null } : item) } : day) } : plan);
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    setSelected((plan) => plan ? { ...plan, days: plan.days.map((day, index) => index === dayIndex ? { ...day, items: day.items.filter((_, position) => position !== itemIndex).map((item, position) => ({ ...item, position: position + 1 })) } : day) } : plan);
  }

  function addPlace(dayIndex: number) {
    if (!placeChoice) return;
    setSelected((plan) => plan ? { ...plan, days: plan.days.map((day, index) => index === dayIndex ? { ...day, items: [...day.items, { id: crypto.randomUUID(), itemType: "PLACE" as const, stationId: null, placeId: placeChoice, routeSnapshot: null, note: null, scheduledTime: null, durationMinutes: null, position: day.items.length + 1 }] } : day) } : plan);
  }

  function addDay() {
    setSelected((plan) => {
      if (!plan || plan.days.length >= 31) return plan;
      const dayDate = addCalendarDays(plan.endDate, 1);
      return { ...plan, endDate: dayDate, days: [...plan.days, { id: crypto.randomUUID(), dayDate, title: `${plan.days.length + 1}일차`, position: plan.days.length + 1, items: [{ id: crypto.randomUUID(), itemType: "NOTE" as const, note: "새 날짜의 첫 일정을 추가해 보세요.", stationId: null, placeId: null, routeSnapshot: null, scheduledTime: null, durationMinutes: null, position: 1 }] }] };
    });
  }

  function moveItem(dayIndex: number, itemIndex: number, delta: -1 | 1) {
    setSelected((plan) => {
      if (!plan) return plan;
      const target = itemIndex + delta;
      const selectedDay = plan.days[dayIndex];
      if (!selectedDay || target < 0 || target >= selectedDay.items.length) return plan;
      const days = plan.days.map((day, index) => {
        if (index !== dayIndex) return day;
        const items = [...day.items];
        const currentItem = items[itemIndex];
        const targetItem = items[target];
        if (!currentItem || !targetItem) return day;
        items[itemIndex] = targetItem;
        items[target] = currentItem;
        return { ...day, items: items.map((item, position) => ({ ...item, position: position + 1 })) };
      });
      return { ...plan, days };
    });
  }

  async function savePlan() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const { data, error: apiError } = await api.PUT("/api/v1/plans/{plan_id}", {
      params: { path: { plan_id: selected.id } },
      headers: { "If-Match": `W/"${selected.version}"` },
      body: toWriteRequest(selected),
    });
    if (data) {
      setSelected(data);
      setMessage("일정을 저장했습니다.");
      await loadPlans();
    } else {
      setError(apiError && typeof apiError === "object" ? "다른 곳에서 변경되었거나 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요." : "저장하지 못했습니다.");
    }
    setPending(false);
  }

  async function sharePlan() {
    if (!selected) return;
    const { data } = await api.POST("/api/v1/plans/{plan_id}/share-links", {
      params: { path: { plan_id: selected.id } }, body: { expiresInDays: 7 },
    });
    if (data) setShareLink({ id: data.id, path: data.urlPath });
  }

  async function revokeShare() {
    if (!selected || !shareLink) return;
    const { response } = await api.DELETE("/api/v1/plans/{plan_id}/share-links/{link_id}", { params: { path: { plan_id: selected.id, link_id: shareLink.id } } });
    if (response.ok) { setShareLink(null); setMessage("공유 링크를 회수했습니다."); }
  }

  async function copyPlan() {
    if (!selected) return;
    const { data, error: apiError } = await api.POST("/api/v1/plans/{plan_id}/copies", { params: { path: { plan_id: selected.id } } });
    if (data) { setSelected(data); setMessage("독립된 일정 사본을 만들었습니다."); await loadPlans(); } else setError(JSON.stringify(apiError));
  }

  async function deletePlan() {
    if (!selected || !window.confirm(`'${selected.title}' 일정을 삭제할까요?`)) return;
    const { response } = await api.DELETE("/api/v1/plans/{plan_id}", { params: { path: { plan_id: selected.id } } });
    if (!response.ok) { setError("일정을 삭제하지 못했습니다."); return; }
    setSelected(null); setShareLink(null); setMessage("일정을 삭제했습니다."); await loadPlans();
  }

  if (status === "loading") return <main className="centerState"><p>세션을 확인하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>내 일정은 로그인 후 사용할 수 있어요</h1><p>작성 중이던 탐색 흐름은 그대로 이어집니다.</p><Link className="primaryButton" href="/login">로그인</Link></main>;

  return (
    <main className="plannerPage contentShell">
      <header className="sectionHeader"><div><p className="eyebrow">STRUCTURED TRAVEL PLAN</p><h1>내 일정</h1><p>날짜와 장소의 순서를 명확하게 정리하고 공유하세요.</p></div></header>
      {message && <div className="successBanner" role="status">{message}<button type="button" onClick={() => setMessage(null)}>닫기</button></div>}
      {error && <div className="inlineError" role="alert"><p>{error}</p></div>}
      <div className="plannerLayout">
        <aside className="planLibrary">
          <form className="quickPlan" onSubmit={createPlan}>
            <h2>새 일정</h2>
            <label>제목<input name="title" required maxLength={120} placeholder="온양온천 하루 여행" /></label>
            <label>출발일<input name="date" required type="date" defaultValue={dateInSeoul()} /></label>
            <button type="submit" disabled={pending}>일정 만들기</button>
          </form>
          <h2>저장된 일정</h2>
          {loading ? <div className="planListSkeleton" /> : plans.length === 0 ? <div className="emptyState"><strong>아직 일정이 없어요</strong><p>첫 일정을 만들어 보세요.</p></div> : <div className="planList">{plans.map((plan) => <button type="button" key={plan.id} aria-pressed={selected?.id === plan.id} onClick={() => void openPlan(plan.id)}><strong>{plan.title}</strong><span>{plan.startDate} · v{plan.version}</span></button>)}</div>}
        </aside>
        <section className="planEditor">
          {selected ? <>
            <div className="editorTop"><div><label className="srOnly" htmlFor="plan-title">일정 제목</label><input id="plan-title" value={selected.title} onChange={(event) => updateTitle(event.target.value)} /></div><div className="editorActions"><button type="button" className="outlineButton" onClick={() => void copyPlan()}>복제</button><button type="button" className="outlineButton" onClick={() => void sharePlan()}>공유</button><button type="button" className="dangerButton" onClick={() => void deletePlan()}>삭제</button><button type="button" className="primaryButton" disabled={pending} onClick={() => void savePlan()}>{pending ? "저장 중…" : "저장"}</button></div></div>
            <p className="editorMeta">{selected.startDate} – {selected.endDate} · {selected.visibility} · version {selected.version}</p>
            {shareLink && <div className="shareResult"><span>7일간 유효한 UNLISTED 링크</span><code>{location.origin}{shareLink.path}</code><button type="button" onClick={() => void revokeShare()}>링크 회수</button></div>}
            <div className="daysBoard">{selected.days.map((day, dayIndex) => <article key={day.id} className="planDay"><header><span>DAY {dayIndex + 1}</span><div><strong>{day.title ?? `${dayIndex + 1}일차`}</strong><time>{day.dayDate}</time></div></header><ol>{day.items.map((item, itemIndex) => <li key={item.id}><span className="itemHandle" aria-hidden>⋮⋮</span><div className="itemBody"><small>{item.itemType}</small>{item.itemType === "NOTE" ? <input value={item.note ?? ""} onChange={(event) => updateNote(dayIndex, itemIndex, event.target.value)} /> : <strong>{item.itemType === "PLACE" ? availablePlaces.find((place) => place.id === item.placeId)?.name ?? "저장된 장소" : item.itemType === "STATION" ? "저장된 역" : "경로 스냅샷"}</strong>}<label className="itemTime">시각<input type="time" value={item.scheduledTime?.slice(0, 5) ?? ""} onChange={(event) => updateItemTime(dayIndex, itemIndex, event.target.value)} /></label><button className="removeItem" type="button" onClick={() => removeItem(dayIndex, itemIndex)}>항목 삭제</button></div><div className="reorderButtons"><button type="button" disabled={itemIndex === 0} onClick={() => moveItem(dayIndex, itemIndex, -1)} aria-label="위로 이동">↑</button><button type="button" disabled={itemIndex === day.items.length - 1} onClick={() => moveItem(dayIndex, itemIndex, 1)} aria-label="아래로 이동">↓</button></div></li>)}</ol><div className="addPlanActions"><button type="button" className="addPlanItem" onClick={() => addNote(dayIndex)}>+ 메모</button><select aria-label={`${dayIndex + 1}일차에 추가할 장소`} value={placeChoice} onChange={(event) => setPlaceChoice(event.target.value)}>{availablePlaces.map((place) => <option value={place.id} key={place.id}>{place.name}</option>)}</select><button type="button" className="addPlanItem" disabled={!placeChoice} onClick={() => addPlace(dayIndex)}>+ 장소</button></div></article>)}</div>
            <button type="button" className="addDayButton" onClick={addDay}>+ 다음 날짜 추가</button>
          </> : <div className="emptyState editorEmpty"><strong>편집할 일정을 선택해 주세요</strong><p>왼쪽 목록에서 일정을 고르거나 새로 만드세요.</p></div>}
        </section>
      </div>
    </main>
  );
}
