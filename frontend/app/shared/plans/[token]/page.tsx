"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SharedPlanView } from "@/components/SharedPlanView";

type PlanView = components["schemas"]["PlanView"];

export default function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <main className="centerState"><h1>링크를 사용할 수 없어요</h1><p>{error}</p><Link href="/">MetroTrip 홈</Link></main>;
  if (!plan) return <main className="centerState"><p>공유 일정을 불러오는 중…</p></main>;

  return <SharedPlanView plan={plan} />;
}
