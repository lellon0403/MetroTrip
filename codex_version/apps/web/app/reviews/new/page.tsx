"use client";

import type { components } from "@metrotrip/contracts";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, ImagePlus, Plus, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";

type Station = components["schemas"]["StationSummary"];
type Plan = components["schemas"]["PlanSummary"];
type PlanView = components["schemas"]["PlanView"];
type UploadedImage = { id: string; url: string; altText: string };
type EditorNode = { type?: string; attrs?: Record<string, string>; text?: string; content?: EditorNode[] };

function SortableImage({ image, selected, onSelect, onRemove }: { image: UploadedImage; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: image.id });
  return <figure ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={selected ? "selected" : ""} {...attributes}>
    <button type="button" className="imageThumb" onClick={onSelect} {...listeners} aria-label="대표 이미지로 선택"><img src={image.url} alt={image.altText} /></button>
    <button type="button" className="imageRemove" onClick={onRemove} aria-label={`${image.altText} 삭제`}><X size={13} aria-hidden /></button>
  </figure>;
}

function formatWon(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ko-KR") : "";
}

export default function NewReviewPage() {
  const router = useRouter();
  const { status } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const planDialogRef = useRef<HTMLDialogElement>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanView | null>(null);
  const [title, setTitle] = useState("");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [travelDate, setTravelDate] = useState(dateInSeoul());
  const [rating, setRating] = useState(5);
  const [cost, setCost] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [placeRatings, setPlaceRatings] = useState<Record<string, number>>({});
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: "<p>여행에서 좋았던 순간과 동선을 기록해 보세요.</p>",
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file || moved) return false;
        event.preventDefault();
        void upload(file, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null);
        return true;
      },
    },
  });

  useEffect(() => {
    void api.GET("/api/v1/stations", { params: { query: { limit: 100 } } }).then(({ data }) => setStations(data?.items ?? []));
  }, []);
  useEffect(() => {
    if (status === "authenticated") void api.GET("/api/v1/plans", { params: { query: { limit: 50 } } }).then(({ data }) => setPlans(data?.items ?? []));
  }, [status]);

  const planPlaces = useMemo(() => selectedPlan?.days.flatMap((day) => day.items).filter((item) => item.placeId) ?? [], [selectedPlan]);

  useEffect(() => {
    for (const item of planPlaces) {
      if (!item.placeId || placeNames[item.placeId]) continue;
      void api.GET("/api/v1/places/{place_id}", { params: { path: { place_id: item.placeId } } }).then(({ data }) => {
        if (data) setPlaceNames((current) => ({ ...current, [item.placeId as string]: data.name }));
      });
    }
  }, [placeNames, planPlaces]);

  async function upload(file: File, position: number | null = null) {
    if (!editor || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("JPEG, PNG, WebP 형식의 10MB 이하 이미지만 추가할 수 있습니다.");
      return;
    }
    setPending(true); setError(null);
    let dimensions: { width?: number; height?: number } = {};
    try { const bitmap = await createImageBitmap(file); dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close(); } catch { /* 이미지 크기 없이도 업로드할 수 있습니다. */ }
    const { data: claim, error: claimError } = await api.POST("/api/v1/media/claims", { body: { filename: file.name, mimeType: file.type, sizeBytes: file.size, ...dimensions } });
    if (!claim) { setError((claimError as { error?: { message?: string } } | undefined)?.error?.message ?? "이미지 업로드를 시작하지 못했습니다."); setPending(false); return; }
    const uploaded = await fetch(claim.uploadUrl, { method: "PUT", headers: claim.uploadHeaders, body: file });
    if (!uploaded.ok) { setError("이미지 저장소 업로드에 실패했습니다."); setPending(false); return; }
    const { data: complete } = await api.POST("/api/v1/media/claims/{media_id}/complete", { params: { path: { media_id: claim.id } } });
    if (!complete) { setError("이미지 검사를 완료하지 못했습니다."); setPending(false); return; }
    const image = { id: complete.id, url: complete.publicUrl, altText: file.name };
    setImages((current) => [...current, image]);
    setCoverId((current) => current ?? image.id);
    const node = { type: "image", attrs: { src: image.url, alt: image.altText } };
    if (position !== null) editor.commands.insertContentAt(position, node); else editor.chain().focus().insertContent(node).run();
    setPending(false);
  }

  async function choosePlan(id: string) {
    const { data } = await api.GET("/api/v1/plans/{plan_id}", { params: { path: { plan_id: id } } });
    if (!data) { setError("일정을 불러오지 못했습니다."); return; }
    setSelectedPlan(data);
    const stationIds = data.days.flatMap((day) => day.items).filter((item) => item.stationId).map((item) => item.stationId as string);
    setOriginId(stationIds[0] ?? ""); setDestinationId(stationIds.at(-1) ?? "");
    setPlaceRatings({}); planDialogRef.current?.close();
  }

  function addTag() {
    const tag = tagInput.trim().replace(/^#/, "");
    if (!tag) return;
    if (tags.length >= 5) { setError("태그는 최대 5개까지 추가할 수 있습니다."); return; }
    if (!tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) setTags((current) => [...current, tag]);
    setTagInput("");
  }
  function reorderImages(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    setImages((current) => arrayMove(current, current.findIndex((item) => item.id === event.active.id), current.findIndex((item) => item.id === event.over?.id)));
  }
  function removeImage(id: string) {
    setImages((current) => current.filter((item) => item.id !== id));
    setCoverId((current) => current === id ? images.find((item) => item.id !== id)?.id ?? null : current);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const nodes = (editor.getJSON().content ?? []) as EditorNode[];
    const blocks: components["schemas"]["ReviewBlock"][] = [];
    for (const node of nodes) {
      if (node.type === "paragraph") {
        const text = node.content?.map((child) => child.text ?? "").join("").trim();
        if (text) blocks.push({ kind: "PARAGRAPH", text });
      }
      if (node.type === "image") {
        const image = images.find((item) => item.url === node.attrs?.src);
        if (image) blocks.push({ kind: "IMAGE", mediaId: image.id, altText: image.altText });
      }
    }
    if (!blocks.some((block) => block.kind === "PARAGRAPH")) { setError("여행 이야기를 한 문단 이상 작성해 주세요."); return; }
    setPending(true); setError(null);
    const { data, error: apiError } = await api.POST("/api/v1/reviews", { body: {
      title, planId: selectedPlan?.id ?? null, originStationId: originId, destinationStationId: destinationId || null,
      rating: String(rating), travelDate, costWon: cost ? Number(cost.replace(/,/g, "")) : null, status: "PUBLISHED", blocks, tags,
      coverMediaId: coverId, placeRatings: Object.entries(placeRatings).filter(([, value]) => value > 0).map(([placeId, value]) => ({ placeId, rating: String(value) })),
    } });
    if (data) router.push(`/reviews/${data.id}`); else setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "후기를 게시하지 못했습니다.");
    setPending(false);
  }

  if (status === "loading") return <main className="centerState"><p>작성 환경을 준비하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>후기 작성은 로그인이 필요합니다</h1><a className="primaryButton" href="/login">로그인</a></main>;
  return <main className="reviewComposer contentShell"><header><p className="eyebrow">WRITE YOUR STORY</p><h1>후기 작성</h1><p>일정을 연결하고, 지도에서 다녀온 장소와 이야기를 한 편의 여행 기록으로 남겨보세요.</p></header>
    <form onSubmit={submit}><label>제목<input required minLength={2} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <section className="planConnect"><div><span>연결할 내 일정</span><strong>{selectedPlan?.title ?? "아직 선택하지 않았어요"}</strong><small>{selectedPlan ? `${selectedPlan.startDate} – ${selectedPlan.endDate} · 역과 장소를 자동으로 불러왔어요.` : "선택하면 출발·도착 역과 장소별 평점을 연결합니다."}</small></div><button type="button" className="outlineButton" onClick={() => planDialogRef.current?.showModal()}><CalendarDays size={16} aria-hidden /> 일정 선택</button></section>
      <div className="composerRoute"><label>방문한 역<select required value={originId} onChange={(event) => setOriginId(event.target.value)}><option value="" disabled>역 선택</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label><label>이동한 역 (선택)<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">한 역만 방문했어요</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label></div>
      <div className="composerMeta"><label>여행일<input type="date" required value={travelDate} onChange={(event) => setTravelDate(event.target.value)} /></label><fieldset className="starField"><legend>평점</legend><div>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value}점`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={22} fill={rating >= value ? "currentColor" : "none"} aria-hidden /></button>)}</div></fieldset><label>비용<input inputMode="numeric" placeholder="0" value={cost} onChange={(event) => setCost(formatWon(event.target.value))} /></label></div>
      <div className="costQuick"><span>빠른 선택</span>{[10000, 50000, 100000, 500000].map((value) => <button type="button" key={value} onClick={() => setCost(value.toLocaleString("ko-KR"))}>{value.toLocaleString("ko-KR")}원</button>)}<button type="button" onClick={() => setCost("")}><Plus size={14} aria-hidden /> 직접 입력</button></div>
      {planPlaces.length ? <section className="placeRatingSection"><h2>장소별 평점 <small>선택 사항</small></h2>{planPlaces.map((item) => <PlaceRating key={item.id} name={placeNames[item.placeId as string] ?? "장소 정보 불러오는 중"} rating={placeRatings[item.placeId as string] ?? 0} onChange={(value) => setPlaceRatings((current) => ({ ...current, [item.placeId as string]: value }))} />)}</section> : null}
      <section className="storyEditor"><header><span>여행 이야기</span><div><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="굵게">B</button><button type="button" onClick={() => inputRef.current?.click()} aria-label="이미지 추가"><ImagePlus size={17} aria-hidden /></button></div></header><EditorContent editor={editor} /><input ref={inputRef} className="srOnly" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /><p>이미지 버튼을 누르거나 이 영역에 이미지를 끌어 놓으세요. 본문 안에서 이미지를 드래그해 순서를 바꿀 수 있습니다.</p></section>
      {images.length ? <section className="imageOrder"><header><div><strong>사진 순서와 대표 이미지</strong><small>사진을 드래그해 순서를 바꾸고, 사진을 눌러 대표 이미지로 지정하세요.</small></div></header><DndContext collisionDetection={closestCenter} onDragEnd={reorderImages}><SortableContext items={images.map((image) => image.id)} strategy={horizontalListSortingStrategy}><div>{images.map((image) => <SortableImage key={image.id} image={image} selected={coverId === image.id} onSelect={() => setCoverId(image.id)} onRemove={() => removeImage(image.id)} />)}</div></SortableContext></DndContext></section> : null}
      <section className="tagEditor"><label>태그<input value={tagInput} placeholder="태그 입력 후 Enter" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} /></label><div>{tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>#{tag}<X size={12} aria-hidden /></button>)}</div></section>
      {error ? <div className="inlineError" role="alert"><p>{error}</p></div> : null}<button className="primaryButton" type="submit" disabled={pending}>{pending ? "처리 중…" : "후기 게시"}</button>
    </form>
    <dialog ref={planDialogRef} className="planPickerDialog"><header><div><p className="eyebrow">MY PLANS</p><h2>연결할 일정 선택</h2></div><button type="button" aria-label="닫기" onClick={() => planDialogRef.current?.close()}><X size={19} aria-hidden /></button></header><div>{plans.length ? plans.map((plan) => <button type="button" key={plan.id} onClick={() => void choosePlan(plan.id)}><strong>{plan.title}</strong><small>{plan.startDate} – {plan.endDate}</small></button>) : <p>연결할 일정이 없습니다. 지도에서 먼저 일정을 만들어 주세요.</p>}</div></dialog>
  </main>;
}

function PlaceRating({ name, rating, onChange }: { name: string; rating: number; onChange: (rating: number) => void }) {
  return <div className="placeRating"><span>{name}</span><div>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value}점`} aria-pressed={rating === value} onClick={() => onChange(rating === value ? 0 : value)}><Star size={16} fill={rating >= value ? "currentColor" : "none"} aria-hidden /></button>)}</div></div>;
}
