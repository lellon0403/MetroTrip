"use client";

import type { components } from "@metrotrip/contracts";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type DeletedPlan = components["schemas"]["DeletedPlanSummary"];

function remainingLabel(expiresAt: string) {
  const hours = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
  return hours > 24 ? `${Math.ceil(hours / 24)}일 후 영구 삭제` : `${hours}시간 후 영구 삭제`;
}

export default function DeletedPlansPage() {
  const { status } = useSession();
  const [items, setItems] = useState<DeletedPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    const { data } = await api.GET("/api/v1/plans/deleted");
    setItems(data?.items ?? []);
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function restore(id: string) {
    setPending(id);
    const { data, error: apiError } = await api.POST("/api/v1/plans/{plan_id}/restore", { params: { path: { plan_id: id } } });
    if (data) await load();
    else setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "일정을 복원하지 못했습니다.");
    setPending(null);
  }

  if (status === "loading") return <main className="centerState"><p>삭제된 일정을 불러오는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>로그인 후 삭제된 일정을 확인할 수 있어요</h1><Link className="primaryButton" href="/login">로그인</Link></main>;
  return <main className="deletedPlansPage contentShell"><Link className="backLink" href="/plans"><ArrowLeft size={16} aria-hidden /> 내 일정</Link><header><p className="eyebrow">RECENTLY DELETED</p><h1>삭제된 일정</h1><p>삭제한 일정은 3일 동안 보관되며, 기간이 지나면 자동으로 영구 삭제됩니다.</p></header>{error ? <div className="inlineError"><p>{error}</p></div> : null}<section className="deletedPlanList">{items.length ? items.map((item) => <article key={item.id}><span className="deletedPlanIcon"><Trash2 size={19} aria-hidden /></span><div><strong>{item.title}</strong><small>{item.startDate} – {item.endDate} · {remainingLabel(item.expiresAt)}</small></div><button type="button" className="outlineButton" disabled={pending === item.id} onClick={() => void restore(item.id)}><RotateCcw size={15} aria-hidden /> {pending === item.id ? "복원 중" : "복원"}</button></article>) : <div className="planReaderBlank"><Trash2 size={32} aria-hidden /><strong>삭제된 일정이 없어요</strong><p>삭제한 일정은 이곳에서 3일 동안 복원할 수 있습니다.</p></div>}</section></main>;
}
