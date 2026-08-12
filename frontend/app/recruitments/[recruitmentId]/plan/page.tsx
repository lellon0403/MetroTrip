"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { SharedPlanView } from "@/components/SharedPlanView";
import { api } from "@/lib/api";

type PlanView = components["schemas"]["PlanView"];

export default function RecruitmentPlanPage({ params }: { params: Promise<{ recruitmentId: string }> }) {
  const { recruitmentId } = use(params);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.GET("/api/v1/recruitments/{recruitment_id}/plan", { params: { path: { recruitment_id: recruitmentId } } }).then(({ data, error: apiError }) => {
      if (!active) return;
      if (data) setPlan(data);
      else setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "연결된 일정을 찾을 수 없습니다.");
    });
    return () => { active = false; };
  }, [recruitmentId]);

  if (error) return <main className="centerState"><h1>일정을 볼 수 없어요</h1><p>{error}</p><Link href={`/recruitments/${recruitmentId}`}>모집글로 돌아가기</Link></main>;
  if (!plan) return <main className="centerState"><p>공유 일정을 불러오는 중…</p></main>;
  return <SharedPlanView plan={plan} backHref={`/recruitments/${recruitmentId}`} mapHref={`/discover?recruitmentPlan=${recruitmentId}`} />;
}
