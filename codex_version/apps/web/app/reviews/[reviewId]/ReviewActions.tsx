"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, Flag, Share2, Trash2 } from "lucide-react";
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

  async function remove() {
    if (!window.confirm("이 후기를 삭제할까요?")) return;
    const { response } = await api.DELETE("/api/v1/reviews/{review_id}", { params: { path: { review_id: reviewId } } });
    if (response.ok) router.push("/reviews"); else setMessage("후기를 삭제하지 못했습니다.");
  }

  return <div className="reviewActions"><span><Eye size={14} aria-hidden /> 조회 {viewCount}</span><button type="button" onClick={() => void share()}><Share2 size={14} aria-hidden /> 공유</button>{!owner && <button type="button" onClick={() => void report()}><Flag size={14} aria-hidden /> 신고</button>}{owner && <><Link href={`/reviews/${reviewId}/edit`}>수정</Link><button className="dangerText" type="button" onClick={() => void remove()}><Trash2 size={14} aria-hidden /> 삭제</button></>}{message && <span role="status">{message}</span>}</div>;
}
