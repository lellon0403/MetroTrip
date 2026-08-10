"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type PlanView = components["schemas"]["PlanView"];

export default function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { status } = useSession();
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let active = true;
    void api.GET("/api/v1/shared/plans/{share_token}", {
      params: { path: { share_token: token } },
    }).then(({ data, error: apiError }) => {
      if (!active) return;
      if (data) setPlan(data);
      else {
        const envelope = apiError as { error?: { message?: string } } | undefined;
        setError(envelope?.error?.message ?? "공유 일정을 열 수 없습니다.");
      }
    });
    return () => { active = false; };
  }, [token]);

  async function copyPlan() {
    if (status !== "authenticated") { router.push("/login"); return; }
    setCopying(true);
    const { data, error: apiError } = await api.POST("/api/v1/shared/plans/{share_token}/copies", { params: { path: { share_token: token } } });
    if (data) router.push("/plans");
    else {
      const envelope = apiError as { error?: { message?: string } } | undefined;
      setError(envelope?.error?.message ?? "일정을 복제하지 못했습니다.");
      setCopying(false);
    }
  }

  if (error) return <main className="centerState"><h1>링크를 사용할 수 없어요</h1><p>{error}</p><Link href="/">MetroTrip 홈</Link></main>;
  if (!plan) return <main className="centerState"><p>공유 일정을 불러오는 중…</p></main>;

  return (
    <main className="sharedPlan contentShell">
      <header><p className="eyebrow">UNLISTED TRIP</p><h1>{plan.title}</h1><p>{plan.startDate} – {plan.endDate}</p><div className="dataNotice">이 페이지는 링크를 가진 사람만 볼 수 있습니다. 검색이나 공개 목록에는 노출되지 않습니다.</div><button className="primaryButton sharedCopyButton" type="button" disabled={copying} onClick={() => void copyPlan()}>{copying ? "복제 중…" : status === "authenticated" ? "내 일정으로 복제" : "로그인하고 복제"}</button></header>
      <div className="sharedDays">{plan.days.map((day, index) => <article key={day.id}><aside><span>DAY {index + 1}</span><strong>{day.title ?? `${index + 1}일차`}</strong><time>{day.dayDate}</time></aside><ol>{day.items.map((item) => <li key={item.id}><small>{item.itemType}</small><strong>{item.note ?? (item.itemType === "PLACE" ? "여행 장소" : item.itemType === "STATION" ? "이동 역" : "저장된 경로")}</strong>{item.scheduledTime && <time>{item.scheduledTime.slice(0, 5)}</time>}</li>)}</ol></article>)}</div>
    </main>
  );
}
