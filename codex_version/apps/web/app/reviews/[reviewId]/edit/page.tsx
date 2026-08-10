"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Review = components["schemas"]["ReviewDetail"];
type Station = components["schemas"]["StationSummary"];

export default function EditReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = use(params);
  const router = useRouter();
  const { status, user } = useSession();
  const [review, setReview] = useState<Review | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.GET("/api/v1/reviews/{review_id}", { params: { path: { review_id: reviewId } } }),
      api.GET("/api/v1/stations", { params: { query: { limit: 100 } } }),
    ]).then(([detail, stationPage]) => { setReview(detail.data ?? null); setStations(stationPage.data?.items ?? []); if (!detail.data) setError("후기를 불러오지 못했습니다."); });
  }, [reviewId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review) return;
    setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    const paragraph = { kind: "PARAGRAPH" as const, text: String(form.get("body")) };
    const mediaBlocks = review.blocks.filter((block) => block.kind === "IMAGE");
    const { data, error: apiError } = await api.PUT("/api/v1/reviews/{review_id}", {
      params: { path: { review_id: review.id } },
      headers: { "If-Match": `W/"${review.version}"` },
      body: {
        title: String(form.get("title")), planId: review.planId,
        originStationId: String(form.get("origin")), destinationStationId: String(form.get("destination")) || null,
        rating: String(form.get("rating")), travelDate: String(form.get("date")),
        costWon: Number(form.get("cost")) || null, status: review.status,
        blocks: [paragraph, ...mediaBlocks],
        tags: String(form.get("tags")).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
      },
    });
    if (data) router.push(`/reviews/${data.id}`);
    else setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "후기를 저장하지 못했습니다. 최신 내용을 다시 확인해 주세요.");
    setPending(false);
  }

  if (status === "loading" || !review) return <main className="centerState"><p>후기를 불러오는 중…</p></main>;
  if (status !== "authenticated" || user?.id !== review.authorId) return <main className="centerState"><h1>수정 권한이 없습니다</h1><Link href={`/reviews/${reviewId}`}>후기로 돌아가기</Link></main>;
  const paragraph = review.blocks.find((block) => block.kind === "PARAGRAPH")?.text ?? "";
  return <main className="reviewComposer contentShell"><header><p className="eyebrow">EDIT YOUR STORY</p><h1>후기 수정</h1><p>공개된 경로와 경험을 최신 내용으로 고쳐보세요.</p></header><form onSubmit={submit}><label>제목<input name="title" required minLength={2} maxLength={160} defaultValue={review.title} /></label><div className="composerRoute"><label>방문한 역<select name="origin" required defaultValue={review.originStationId}>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label><span>→</span><label>이동한 역 (선택)<select name="destination" defaultValue={review.destinationStationId ?? ""}><option value="">한 역만 방문했어요</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label></div><div className="composerMeta"><label>여행일<input name="date" type="date" required defaultValue={review.travelDate} /></label><label>평점<select name="rating" defaultValue={String(review.rating)}><option>5</option><option>4.5</option><option>4</option><option>3.5</option><option>3</option><option>2.5</option><option>2</option><option>1.5</option><option>1</option></select></label><label>비용<input name="cost" type="number" min="0" defaultValue={review.costWon ?? ""} /></label></div><label>여행 이야기<textarea name="body" required minLength={10} rows={12} defaultValue={paragraph} /></label><label>태그<input name="tags" defaultValue={review.tags.join(", ")} /></label><p className="fieldHint">기존 이미지 {review.media.length}개는 그대로 유지됩니다.</p>{error && <div className="inlineError" role="alert"><p>{error}</p></div>}<button className="primaryButton" type="submit" disabled={pending}>{pending ? "저장 중…" : "수정 저장"}</button></form></main>;
}
