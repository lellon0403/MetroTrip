"use client";

import type { components } from "@metrotrip/contracts";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";

type Station = components["schemas"]["StationSummary"];
type Plan = components["schemas"]["PlanSummary"];
type UploadedImage = { id: string; url: string; altText: string };
type ReviewDraft = { title?: string; plan?: string; origin?: string; destination?: string; date?: string; rating?: string; cost?: string; body?: string; tags?: string };
const DRAFT_KEY = "metrotrip.review-draft";

export default function NewReviewPage() {
  const router = useRouter();
  const { status } = useSession();
  const [stations, setStations] = useState<Station[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.GET("/api/v1/stations", { params: { query: { limit: 100 } } }).then(({ data }) => setStations(data?.items ?? []));
    queueMicrotask(() => {
      try { setDraft(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as ReviewDraft | null); } catch { setDraft(null); }
      setDraftLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void api.GET("/api/v1/plans", { params: { query: { limit: 50 } } }).then(({ data }) => setPlans(data?.items ?? []));
    }
  }, [status]);

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const value = Object.fromEntries(
      ["title", "plan", "origin", "destination", "date", "rating", "cost", "body", "tags"]
        .map((name) => [name, String(form.get(name) ?? "")]),
    ) as ReviewDraft;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
  }

  async function upload(file: File) {
    setPending(true);
    setError(null);
    let dimensions: { width?: number; height?: number } = {};
    try {
      const bitmap = await createImageBitmap(file);
      dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      dimensions = {};
    }
    const { data: claim, error: claimError } = await api.POST("/api/v1/media/claims", {
      body: {
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        ...(dimensions.width ? { width: dimensions.width } : {}),
        ...(dimensions.height ? { height: dimensions.height } : {}),
      },
    });
    if (!claim) {
      setError(JSON.stringify(claimError));
      setPending(false);
      return;
    }
    const uploaded = await fetch(claim.uploadUrl, { method: "PUT", headers: claim.uploadHeaders, body: file });
    if (!uploaded.ok) {
      setError("이미지 저장소 업로드에 실패했습니다.");
      setPending(false);
      return;
    }
    const { data: complete } = await api.POST("/api/v1/media/claims/{media_id}/complete", {
      params: { path: { media_id: claim.id } },
    });
    if (complete) setImage({ id: complete.id, url: complete.publicUrl, altText: file.name });
    else setError("이미지 검사를 완료하지 못했습니다.");
    setPending(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const blocks: components["schemas"]["ReviewBlock"][] = [{ kind: "PARAGRAPH", text: String(form.get("body")) }];
    if (image) blocks.push({ kind: "IMAGE", mediaId: image.id, altText: image.altText });
    const planId = String(form.get("plan") ?? "");
    const destinationId = String(form.get("destination") ?? "");
    const { data, error: apiError } = await api.POST("/api/v1/reviews", {
      body: {
        title: String(form.get("title")),
        planId: planId || null,
        originStationId: String(form.get("origin")),
        destinationStationId: destinationId || null,
        rating: String(form.get("rating")),
        travelDate: String(form.get("date")),
        costWon: Number(form.get("cost")) || null,
        status: "PUBLISHED",
        blocks,
        tags: String(form.get("tags")).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5),
      },
    });
    if (data) {
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/reviews/${data.id}`);
    } else {
      setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "후기를 게시하지 못했습니다.");
    }
    setPending(false);
  }

  if (status === "loading" || !draftLoaded) return <main className="centerState"><p>작성 환경을 준비하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>후기 작성은 로그인이 필요합니다</h1><a className="primaryButton" href="/login">로그인</a></main>;

  return (
    <main className="reviewComposer contentShell">
      <header><p className="eyebrow">WRITE YOUR STORY</p><h1>후기 작성</h1><p>한 역만 둘러본 여행도, 여러 역을 이동한 여행도 기록할 수 있어요.</p></header>
      <form onSubmit={submit} onInput={saveDraft}>
        <p className="draftStatus" role="status">입력 내용은 이 브라우저에 초안으로 자동 저장됩니다.</p>
        <label>제목<input name="title" required minLength={2} maxLength={160} defaultValue={draft?.title} /></label>
        <label>연결할 내 일정<select name="plan" defaultValue={draft?.plan ?? ""}><option value="">연결하지 않음</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>
        <div className="composerRoute">
          <label>방문한 역<select name="origin" required defaultValue={draft?.origin ?? ""}><option value="" disabled>역 선택</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
          <span>→</span>
          <label>이동한 역 (선택)<select name="destination" defaultValue={draft?.destination ?? ""}><option value="">한 역만 방문했어요</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
        </div>
        <div className="composerMeta">
          <label>여행일<input name="date" type="date" required defaultValue={draft?.date ?? dateInSeoul()} /></label>
          <label>평점<select name="rating" defaultValue={draft?.rating ?? "5"}>{["5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"].map((rating) => <option key={rating}>{rating}</option>)}</select></label>
          <label>비용<input name="cost" type="number" min="0" defaultValue={draft?.cost} /></label>
        </div>
        <label>여행 이야기<textarea name="body" required minLength={10} rows={12} defaultValue={draft?.body} /></label>
        <label>태그<input name="tags" placeholder="온천, 당일치기, 맛집" defaultValue={draft?.tags} /></label>
        <label className="imageDrop">이미지 (JPEG/PNG/WebP, 최대 10MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>
        {image ? <img className="composerPreview" src={image.url} alt={image.altText} /> : null}
        {error ? <div className="inlineError" role="alert"><p>{error}</p></div> : null}
        <button className="primaryButton" type="submit" disabled={pending}>{pending ? "처리 중…" : "후기 게시"}</button>
      </form>
    </main>
  );
}
