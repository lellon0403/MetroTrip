"use client";

import type { components } from "@metrotrip/contracts";
import { CalendarDays, Check, Map as MapIcon, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type PlanSummary = components["schemas"]["PlanSummary"];
type PlanView = components["schemas"]["PlanView"];
type Station = components["schemas"]["StationSummary"];
type Place = components["schemas"]["PlaceDetail"];

function itemTypeLabel(value: string) {
  return { STATION: "역", PLACE: "장소", NOTE: "메모", ROUTE: "이동" }[value] ?? value;
}

function savedPlaceName(item: PlanView["days"][number]["items"][number]) {
  const value = item.routeSnapshot?.placeName;
  return typeof value === "string" ? value : null;
}

export default function PlansPage() {
  const { status } = useSession();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [selected, setSelected] = useState<PlanView | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [places, setPlaces] = useState<Record<string, Place>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharedPlanId, setSharedPlanId] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<{ url: string; copied: boolean } | null>(null);

  const loadPlans = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    const [plansResult, stationsResult] = await Promise.all([
      api.GET("/api/v1/plans", { params: { query: { limit: 50 } } }),
      api.GET("/api/v1/stations", { params: { query: { limit: 100 } } }),
    ]);
    if (plansResult.data) setPlans(plansResult.data.items);
    else setError("일정 목록을 불러오지 못했습니다.");
    setStations(stationsResult.data?.items ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    queueMicrotask(() => void loadPlans());
  }, [loadPlans]);

  const loadPlan = useCallback(async (planId: string) => {
    const { data, error: apiError } = await api.GET("/api/v1/plans/{plan_id}", {
      params: { path: { plan_id: planId } },
    });
    if (!data) {
      setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "일정을 불러오지 못했습니다.");
      return;
    }
    setSelected(data);
  }, []);

  async function deletePlan(plan: PlanSummary) {
    if (!window.confirm(`'${plan.title}' 일정을 삭제할까요? 3일 동안 삭제된 일정에서 복원할 수 있습니다.`)) return;
    setDeletingId(plan.id);
    const { response } = await api.DELETE("/api/v1/plans/{plan_id}", { params: { path: { plan_id: plan.id } } });
    if (response.ok) {
      setPlans((current) => current.filter((item) => item.id !== plan.id));
      setSelected((current) => current?.id === plan.id ? null : current);
    } else setError("일정을 삭제하지 못했습니다.");
    setDeletingId(null);
  }

  async function sharePlan(plan: PlanView) {
    setError(null);
    setShareResult(null);
    const { data, error: apiError } = await api.POST("/api/v1/plans/{plan_id}/share-links", {
      params: { path: { plan_id: plan.id } },
      body: { expiresInDays: 7, maxUses: null },
    });
    if (!data) {
      setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "공유 링크를 만들지 못했습니다.");
      return;
    }
    const url = new URL(data.urlPath, window.location.origin).toString();
    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch { /* HTTP LAN 주소에서는 클립보드 권한이 제한될 수 있다. */ }
    setShareResult({ url, copied });
    setSharedPlanId(plan.id);
  }

  useEffect(() => {
    if (!selected) return;
    const ids = [...new Set(selected.days.flatMap((day) => day.items.map((item) => item.placeId).filter((id): id is string => Boolean(id))))]
      .filter((id) => !places[id]);
    for (const id of ids) {
      void api.GET("/api/v1/places/{place_id}", { params: { path: { place_id: id } } }).then(({ data }) => {
        if (data) setPlaces((current) => ({ ...current, [id]: data }));
      });
    }
  }, [places, selected]);

  const stationNames = useMemo(() => new Map(stations.map((station) => [station.id, station.name])), [stations]);
  const itemCount = selected?.days.reduce((sum, day) => sum + day.items.length, 0) ?? 0;

  if (status === "loading") return <main className="centerState"><p>세션을 확인하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>내 일정은 로그인 후 사용할 수 있어요</h1><Link className="primaryButton" href="/login">로그인</Link></main>;

  return (
    <main className="planReaderPage contentShell">
      <header className="sectionHeader planReaderHeader">
        <div><p className="eyebrow">MY TRAVEL PLANS</p><h1>내 일정</h1><p>일정은 여기서 확인하고, 수정은 지도에서 이어서 진행하세요.</p></div>
        <div className="planReaderHeaderActions"><Link className="outlineButton" href="/plans/deleted"><Trash2 size={16} aria-hidden /> 삭제된 일정</Link><Link className="primaryButton" href="/discover?planner=create"><Plus size={17} aria-hidden /> 일정 만들기</Link></div>
      </header>

      {error ? <div className="inlineError" role="alert"><p>{error}</p></div> : null}
      {shareResult ? <div className="planShareResult" role="status"><div><Check size={17} aria-hidden /><span>{shareResult.copied ? "공유 링크를 복사했습니다." : "공유 링크를 만들었습니다. 아래 링크를 복사해 전달하세요."}</span></div><a href={shareResult.url} target="_blank" rel="noreferrer">{shareResult.url}</a><button type="button" onClick={() => setShareResult(null)}>닫기</button></div> : null}
      <div className="planReaderLayout">
        <aside className="planReaderList" aria-label="저장된 일정">
          <h2>저장된 일정</h2>
          {loading ? <div className="planListSkeleton" /> : plans.length ? plans.map((plan) => <div className="planReaderListRow" key={plan.id}><button type="button" aria-pressed={selected?.id === plan.id} onClick={() => void loadPlan(plan.id)}><CalendarDays size={17} aria-hidden /><span><strong>{plan.title}</strong><small>{plan.startDate} · {plan.status === "ACTIVE" ? "진행 중" : "일정"}</small></span></button><button type="button" className="planListDelete" aria-label={`${plan.title} 삭제`} disabled={deletingId === plan.id} onClick={() => void deletePlan(plan)}><Trash2 size={16} aria-hidden /></button></div>) : <div className="planReaderEmpty"><p>아직 만든 일정이 없어요.</p><Link className="primaryButton" href="/discover?planner=create"><Plus size={16} aria-hidden /> 일정 만들기</Link></div>}
        </aside>

        <section className="planReaderDetail">
          {!selected ? <div className="planReaderBlank"><MapIcon size={34} aria-hidden /><strong>확인할 일정을 선택해 주세요</strong><p>일정을 만들거나 왼쪽 목록에서 선택하면 날짜별 동선을 볼 수 있어요.</p></div> : <>
            <header className="planReaderTitle"><div><p className="eyebrow">{selected.status === "ACTIVE" ? "IN PROGRESS" : "SAVED PLAN"}</p><h2>{selected.title}</h2><p>{selected.startDate} – {selected.endDate} · {itemCount}개 항목</p></div><div className="planReaderTitleActions"><button className="outlineButton" type="button" onClick={() => void sharePlan(selected)}>{sharedPlanId === selected.id ? <Check size={16} aria-hidden /> : <Share2 size={16} aria-hidden />}{sharedPlanId === selected.id ? "공유됨" : "공유"}</button><Link className="primaryButton" href={`/discover?planner=${selected.id}`}><Pencil size={16} aria-hidden /> 일정 수정</Link></div></header>
            {selected.description ? <p className="planReaderDescription">{selected.description}</p> : null}
            <div className="planReaderDays">{selected.days.map((day, dayIndex) => <article key={day.id} className="planReaderDay"><header><span>DAY {dayIndex + 1}</span><div><strong>{day.title || `${dayIndex + 1}일차`}</strong><time>{day.dayDate}</time></div></header><ol>{day.items.map((item, itemIndex) => {
              const name = item.itemType === "STATION" ? `${stationNames.get(item.stationId ?? "") ?? "저장된 역"}역` : item.itemType === "PLACE" ? places[item.placeId ?? ""]?.name ?? savedPlaceName(item) ?? "저장된 장소" : item.note || "메모";
              return <li key={item.id}><span className="planReaderPosition">{itemIndex + 1}</span><div><small>{itemTypeLabel(item.itemType)}</small><strong>{name}</strong>{item.note && item.itemType !== "NOTE" ? <p>{item.note}</p> : null}</div>{item.scheduledTime ? <time>{item.scheduledTime.slice(0, 5)}</time> : null}</li>;
            })}</ol></article>)}</div>
          </>}
        </section>
      </div>
    </main>
  );
}
