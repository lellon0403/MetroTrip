"use client";

import type { components } from "@metrotrip/contracts";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { CalendarDays, ImagePlus, Star, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClearableInput } from "@/components/ClearableInput";
import { api, getAccessToken } from "@/lib/api";
import { dateInSeoul } from "@/lib/date";
import { useSession } from "@/lib/session";

type Station = components["schemas"]["StationSummary"];
type Plan = components["schemas"]["PlanSummary"];
type PlanView = components["schemas"]["PlanView"];
type UploadedImage = { id: string; url: string; altText: string };
type EditorNode = { type?: string; attrs?: Record<string, string>; text?: string; content?: EditorNode[] };
type ImagePosition = { top: number; left: number; width: number; height: number };

const ReviewImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-cover": {
        default: "false",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-cover") ?? "false",
        renderHTML: (attributes: Record<string, string>) => ({ "data-cover": attributes["data-cover"] }),
      },
    };
  },
});

function formatWon(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Math.min(Number(digits), 3_000_000).toLocaleString("ko-KR") : "";
}

function addWon(current: string, amount: number) {
  const currentAmount = Number(current.replace(/[^0-9]/g, "")) || 0;
  return formatWon(String(currentAmount + amount));
}

export default function NewReviewPage() {
  return (
    <Suspense fallback={<main className="centerState"><p>후기 편집 환경을 준비하는 중…</p></main>}>
      <ReviewComposerPage />
    </Suspense>
  );
}

function ReviewComposerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { status } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const planDialogRef = useRef<HTMLDialogElement>(null);
  const costDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const storyEditorRef = useRef<HTMLElement>(null);
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
  const [hoveredImage, setHoveredImage] = useState<{ id: string; top: number; left: number; width: number; height: number } | null>(null);
  const [coverImagePosition, setCoverImagePosition] = useState<ImagePosition | null>(null);
  const [editingReview, setEditingReview] = useState<components["schemas"]["ReviewDetail"] | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const initializedEditRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, ReviewImage],
    content: "",
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
    void Promise.all([
      api.GET("/api/v1/stations", { params: { query: { limit: 100, cursor: "1" } } }),
      api.GET("/api/v1/stations", { params: { query: { limit: 100, cursor: "2" } } }),
    ]).then((results) => {
      const byId = new Map(results.flatMap(({ data }) => data?.items ?? []).map((station) => [station.id, station]));
      setStations([...byId.values()]);
    });
  }, []);
  useEffect(() => {
    if (status === "authenticated") void api.GET("/api/v1/plans", { params: { query: { limit: 50 } } }).then(({ data }) => setPlans(data?.items ?? []));
  }, [status]);

  useEffect(() => {
    if (!editId || status !== "authenticated") return;
    void api.GET("/api/v1/reviews/{review_id}", { params: { path: { review_id: editId } } }).then(({ data }) => {
      if (data) setEditingReview(data);
      else setError("후기를 불러오지 못했습니다.");
    });
  }, [editId, status]);

  useEffect(() => {
    if (!editingReview || !editor || initializedEditRef.current === editingReview.id) return;
    initializedEditRef.current = editingReview.id;
    setTitle(editingReview.title);
    setOriginId(editingReview.originStationId);
    setDestinationId(editingReview.destinationStationId ?? "");
    setTravelDate(editingReview.travelDate);
    setRating(Number(editingReview.rating));
    setCost(editingReview.costWon === null ? "" : formatWon(String(editingReview.costWon)));
    setTags(editingReview.tags.map((tag) => tag.replace(/\s+/g, "_")));
    const mediaById = new Map(editingReview.media.map((item) => [item.id, item]));
    const orderedImages = editingReview.blocks.filter((block) => block.kind === "IMAGE" && block.mediaId).map((block) => {
      const media = mediaById.get(block.mediaId as string);
      return media ? { id: media.id, url: media.url, altText: block.altText ?? media.altText } : null;
    }).filter((item): item is UploadedImage => Boolean(item));
    setImages(orderedImages);
    setCoverId(orderedImages[0]?.id ?? null);
    editor.commands.setContent({ type: "doc", content: editingReview.blocks.map((block) => block.kind === "IMAGE" && block.mediaId && mediaById.get(block.mediaId) ? { type: "image", attrs: { src: mediaById.get(block.mediaId)?.url, alt: block.altText ?? "여행 사진", "data-cover": block.mediaId === orderedImages[0]?.id ? "true" : "false" } } : { type: "paragraph", content: block.text ? [{ type: "text", text: block.text }] : undefined }) });
  }, [editor, editingReview]);

  const planPlaces = useMemo(() => selectedPlan?.days.flatMap((day) => day.items).filter((item) => item.placeId) ?? [], [selectedPlan]);

  useEffect(() => {
    const root = storyEditorRef.current;
    const editorElement = editor?.view.dom;
    if (!root || !editorElement) return;
    const handleMouseOver = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const imageElement = event.target.closest("img");
      if (!imageElement || !editorElement.contains(imageElement)) return;
      const image = images.find((item) => item.url === imageElement.getAttribute("src") || item.url === imageElement.src);
      if (!image) return;
      const imageRect = imageElement.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setHoveredImage({ id: image.id, top: imageRect.top - rootRect.top, left: imageRect.left - rootRect.left, width: imageRect.width, height: imageRect.height });
    };
    editorElement.addEventListener("mouseover", handleMouseOver);
    return () => editorElement.removeEventListener("mouseover", handleMouseOver);
  }, [editor, images]);

  useEffect(() => {
    const root = storyEditorRef.current;
    const editorElement = editor?.view.dom;
    if (!root || !editorElement || !coverId) {
      setCoverImagePosition(null);
      return;
    }
    const updateCoverPosition = () => {
      const cover = images.find((item) => item.id === coverId);
      const imageElement = cover ? [...editorElement.querySelectorAll("img")].find((element) => element.src === cover.url || element.getAttribute("src") === cover.url) : null;
      if (!imageElement) {
        setCoverImagePosition(null);
        return;
      }
      const imageRect = imageElement.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setCoverImagePosition({ top: imageRect.top - rootRect.top, left: imageRect.left - rootRect.left, width: imageRect.width, height: imageRect.height });
    };
    updateCoverPosition();
    editor.on("update", updateCoverPosition);
    window.addEventListener("resize", updateCoverPosition);
    return () => {
      editor.off("update", updateCoverPosition);
      window.removeEventListener("resize", updateCoverPosition);
    };
  }, [coverId, editor, images]);

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
    const uploadHeaders = new Headers(claim.uploadHeaders);
    const accessToken = getAccessToken();
    if (accessToken) uploadHeaders.set("Authorization", `Bearer ${accessToken}`);
    const uploaded = await fetch(claim.uploadUrl, { method: "PUT", headers: uploadHeaders, body: file });
    if (!uploaded.ok) { setError("이미지 저장소 업로드에 실패했습니다."); setPending(false); return; }
    const { data: complete } = await api.POST("/api/v1/media/claims/{media_id}/complete", { params: { path: { media_id: claim.id } } });
    if (!complete) { setError("이미지 검사를 완료하지 못했습니다."); setPending(false); return; }
    const image = { id: complete.id, url: complete.publicUrl, altText: file.name };
    const isCover = !coverId || images.length === 0;
    setImages((current) => [...current, image]);
    setCoverId((current) => current ?? image.id);
    const node = { type: "image", attrs: { src: image.url, alt: image.altText, "data-cover": isCover ? "true" : "false" } };
    editor.commands.insertContentAt(position ?? editor.state.doc.content.size, node);
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
    const tag = tagInput.trim().replace(/^#/, "").replace(/\s+/g, "_");
    if (!tag) return;
    if (tags.length >= 5) { setError("태그는 최대 5개까지 추가할 수 있습니다."); return; }
    if (!tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) setTags((current) => [...current, tag]);
    setTagInput("");
  }

  async function deleteReview() {
    if (!editingReview) return;
    if (deleteConfirmTitle !== editingReview.title) {
      setError("제목을 정확히 입력해야 삭제할 수 있습니다.");
      return;
    }
    setPending(true); setError(null);
    const { response } = await api.DELETE("/api/v1/reviews/{review_id}", { params: { path: { review_id: editingReview.id } } });
    if (response.ok) router.push("/reviews");
    else { setError("후기를 삭제하지 못했습니다."); setPending(false); }
  }
  function selectCoverImage(id: string) {
    const image = images.find((item) => item.id === id);
    if (!image || !editor) return;
    setCoverId(id);
    const transaction = editor.state.tr;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "image") return;
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, "data-cover": node.attrs.src === image.url ? "true" : "false" });
    });
    editor.view.dispatch(transaction);
  }
  function removeImage(id: string) {
    const removedIndex = images.findIndex((item) => item.id === id);
    const removed = images[removedIndex];
    const remaining = images.filter((item) => item.id !== id);
    if (editor && removed) {
      let imagePosition: number | null = null;
      editor.state.doc.descendants((node, position) => {
        if (imagePosition === null && node.type.name === "image" && node.attrs.src === removed.url) imagePosition = position;
      });
      if (imagePosition !== null) editor.commands.deleteRange({ from: imagePosition, to: imagePosition + 1 });
    }
    setImages(remaining);
    if (coverId === id) {
      const nextCover = remaining[removedIndex] ?? remaining[removedIndex - 1] ?? null;
      setCoverId(nextCover?.id ?? null);
      if (nextCover) setTimeout(() => selectCoverImage(nextCover.id), 0);
    }
    setHoveredImage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    if (title.trim().length > 100) { setError("제목은 100자 이내로 입력해 주세요."); return; }
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
    const body = {
      title, planId: editingReview?.planId ?? selectedPlan?.id ?? null, originStationId: originId, destinationStationId: destinationId || null,
      rating: String(rating), travelDate, costWon: cost ? Number(cost.replace(/,/g, "")) : null, status: (editingReview?.status ?? "PUBLISHED") as "DRAFT" | "PUBLISHED" | "HIDDEN", blocks, tags,
      coverMediaId: coverId, placeRatings: Object.entries(placeRatings).filter(([, value]) => value > 0).map(([placeId, value]) => ({ placeId, rating: String(value) })),
    };
    const result = editingReview
      ? await api.PUT("/api/v1/reviews/{review_id}", { params: { path: { review_id: editingReview.id } }, headers: { "If-Match": `W/"${editingReview.version}"` }, body })
      : await api.POST("/api/v1/reviews", { body });
    const { data, error: apiError } = result;
    if (data) router.push(`/reviews/${data.id}`); else setError((apiError as { error?: { message?: string } } | undefined)?.error?.message ?? "후기를 게시하지 못했습니다.");
    setPending(false);
  }

  if (status === "loading" || (editId && !editingReview)) return <main className="centerState"><p>후기 편집 환경을 준비하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>후기 작성은 로그인이 필요합니다</h1><a className="primaryButton" href="/login">로그인</a></main>;
  return <main className="reviewComposer contentShell"><header><p className="eyebrow">{editingReview ? "EDIT YOUR STORY" : "WRITE YOUR STORY"}</p><h1>{editingReview ? "후기 수정" : "후기 작성"}</h1><p>{editingReview ? "공개된 경로와 경험을 최신 내용으로 고쳐보세요." : "일정을 연결하고, 지도에서 다녀온 장소와 이야기를 한 편의 여행 기록으로 남겨보세요."}</p></header>
    <form onSubmit={submit}><label><span>제목 <em className="requiredMark">*</em></span><ClearableInput required minLength={2} value={title} onChange={(event) => setTitle(event.target.value)} aria-invalid={title.length > 100} />{title.length > 100 ? <small className="titleLimitWarning" role="alert">제목은 100자 이내로 입력해 주세요. ({title.length}/100)</small> : null}</label>
      <section className="planConnect"><div><span>연결할 내 일정</span><strong>{selectedPlan?.title ?? "아직 선택하지 않았어요"}</strong><small>{selectedPlan ? `${selectedPlan.startDate} – ${selectedPlan.endDate} · 역과 장소를 자동으로 불러왔어요.` : "선택하면 출발·도착 역과 장소별 평점을 연결합니다."}</small></div><button type="button" className="outlineButton" onClick={() => planDialogRef.current?.showModal()}><CalendarDays size={16} aria-hidden /> 일정 선택</button></section>
      <div className="composerRoute"><label><span>방문한 역 <em className="requiredMark">*</em></span><select required value={originId} onChange={(event) => setOriginId(event.target.value)}><option value="" disabled>역 선택</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label><label>이동한 역 (선택)<select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}><option value="">한 역만 방문했어요</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label></div>
      <div className="composerMeta"><label><span>여행일 <em className="requiredMark">*</em></span><input type="date" required value={travelDate} onChange={(event) => setTravelDate(event.target.value)} /></label><label>여행 경비<button type="button" className="costInputButton" onClick={() => costDialogRef.current?.showModal()}>{cost ? `${cost}원` : "여행 경비 입력"}</button></label><fieldset className="starField"><legend>평점</legend><div>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value}점`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={22} fill={rating >= value ? "currentColor" : "none"} aria-hidden /></button>)}</div></fieldset></div>
      {planPlaces.length ? <section className="placeRatingSection"><h2>장소별 평점 <small>선택 사항</small></h2>{planPlaces.map((item) => <PlaceRating key={item.id} name={placeNames[item.placeId as string] ?? "장소 정보 불러오는 중"} rating={placeRatings[item.placeId as string] ?? 0} onChange={(value) => setPlaceRatings((current) => ({ ...current, [item.placeId as string]: value }))} />)}</section> : null}
      <section ref={storyEditorRef} className="storyEditor" onMouseLeave={() => setHoveredImage(null)} onMouseMove={(event) => { if (!(event.target instanceof Element) || (!event.target.closest("img") && !event.target.closest(".editorImageControls"))) setHoveredImage(null); }}><header><span>여행 이야기</span><div><button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="굵게">B</button><button type="button" onClick={() => inputRef.current?.click()} aria-label="이미지 추가"><ImagePlus size={17} aria-hidden /></button></div></header><EditorContent editor={editor} />{coverImagePosition ? <span className="editorImagePersistentBadge" style={{ top: coverImagePosition.top, left: coverImagePosition.left }}>썸네일</span> : null}{hoveredImage ? <div className="editorImageControls" style={{ top: hoveredImage.top, left: hoveredImage.left, width: hoveredImage.width, height: hoveredImage.height }}><button type="button" className="editorImageRemove" onClick={() => removeImage(hoveredImage.id)} aria-label="사진 삭제"><X size={15} aria-hidden /></button></div> : null}<input ref={inputRef} className="srOnly" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /><p>이미지 버튼을 누르거나 이 영역에 이미지를 끌어 놓으세요. 본문 안에서 이미지를 드래그해 순서를 바꿀 수 있습니다.</p></section>
      <section className="tagEditor"><label>태그<ClearableInput value={tagInput} placeholder="태그 입력 후 Enter" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} /></label><div>{tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>#{tag}<X size={12} aria-hidden /></button>)}</div></section>
      {error ? <div className="inlineError" role="alert"><p>{error}</p></div> : null}<div className={editingReview ? "editSubmitActions" : undefined}><button className="primaryButton" type="submit" disabled={pending}>{pending ? "처리 중…" : editingReview ? "수정 저장" : "후기 게시"}</button>{editingReview ? <button type="button" className="dangerButton" onClick={() => { setDeleteConfirmTitle(""); deleteDialogRef.current?.showModal(); }}>후기 삭제</button> : null}</div>
    </form>
    <dialog ref={planDialogRef} className="planPickerDialog"><header><div><p className="eyebrow">MY PLANS</p><h2>연결할 일정 선택</h2></div><button type="button" aria-label="닫기" onClick={() => planDialogRef.current?.close()}><X size={19} aria-hidden /></button></header><div>{plans.length ? plans.map((plan) => <button type="button" key={plan.id} onClick={() => void choosePlan(plan.id)}><strong>{plan.title}</strong><small>{plan.startDate} – {plan.endDate}</small></button>) : <p>연결할 일정이 없습니다. 지도에서 먼저 일정을 만들어 주세요.</p>}</div></dialog>
    <dialog ref={costDialogRef} className="costDialog"><header><div><p className="eyebrow">TRAVEL COST</p><h2>여행 경비 입력</h2></div><button type="button" aria-label="닫기" onClick={() => costDialogRef.current?.close()}><X size={19} aria-hidden /></button></header><div className="costDialogBody"><label>여행 경비<ClearableInput autoFocus inputMode="numeric" placeholder="최대 3,000,000원" value={cost} onChange={(event) => setCost(formatWon(event.target.value))} /></label><small>최대 300만 원까지 입력할 수 있습니다.</small><div className="costDialogQuick">{[10000, 50000, 100000].map((value) => <button type="button" key={value} onClick={() => setCost(addWon(cost, value))}>+{value.toLocaleString("ko-KR")}원</button>)}</div><button type="button" className="primaryButton" onClick={() => costDialogRef.current?.close()}>저장</button></div></dialog>
    {editingReview ? <dialog ref={deleteDialogRef} className="deleteDialog"><header><div><p className="eyebrow">DELETE REVIEW</p><h2>후기 삭제</h2></div><button type="button" aria-label="닫기" onClick={() => deleteDialogRef.current?.close()}><X size={19} aria-hidden /></button></header><div className="deleteDialogBody"><p>삭제하려면 후기 제목을 그대로 입력해 주세요.</p><strong>{editingReview.title}</strong><ClearableInput autoFocus value={deleteConfirmTitle} onChange={(event) => setDeleteConfirmTitle(event.target.value)} placeholder="후기 제목 입력" /><button type="button" className="dangerButton" onClick={() => void deleteReview()} disabled={pending}>삭제하기</button></div></dialog> : null}
  </main>;
}

function PlaceRating({ name, rating, onChange }: { name: string; rating: number; onChange: (rating: number) => void }) {
  return <div className="placeRating"><span>{name}</span><div>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value}점`} aria-pressed={rating === value} onClick={() => onChange(rating === value ? 0 : value)}><Star size={16} fill={rating >= value ? "currentColor" : "none"} aria-hidden /></button>)}</div></div>;
}
