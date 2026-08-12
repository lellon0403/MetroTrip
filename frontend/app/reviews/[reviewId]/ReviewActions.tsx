"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Flag, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export function ReviewActions({ reviewId, authorId, title, viewCount }: { reviewId: string; authorId: string; title: string; viewCount: number }) {
  const router = useRouter();
  const { status, user } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const owner = user?.id === authorId;

  async function share() {
    const payload = { title, url: window.location.href };
    if (navigator.share) await navigator.share(payload);
    else { await navigator.clipboard.writeText(payload.url); setMessage("후기 주소를 복사했습니다."); }
  }

  async function report() {
    if (status !== "authenticated") { router.push("/login"); return; }
    const reason = window.prompt("신고 사유를 입력해 주세요.");
    if (!reason) return;
    const { data } = await api.POST("/api/v1/reviews/{review_id}/reports", { params: { path: { review_id: reviewId } }, body: { reason } });
    if (data) setMessage("신고가 접수됐습니다.");
  }

  return <div className="reviewActions"><span title={`조회 ${viewCount}회`} aria-label={`조회 ${viewCount}회`}><Eye size={17} aria-hidden /> <b>{viewCount}</b></span><button type="button" title="공유" aria-label="공유" onClick={() => void share()}><Share2 size={17} aria-hidden /></button>{!owner && <button type="button" title="신고" aria-label="신고" onClick={() => void report()}><Flag size={17} aria-hidden /></button>}{owner && <Link href={`/reviews/${reviewId}/edit`}>수정</Link>}{message && <span role="status">{message}</span>}</div>;
}
