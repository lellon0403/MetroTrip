import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Star } from "lucide-react";
import { ReviewLike } from "./ReviewLike";
import { ReviewActions } from "./ReviewActions";

type ReviewDetail = components["schemas"]["ReviewDetail"];
export const dynamic = "force-dynamic";

function apiBase() {
  return (process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

export const metadata = { title: "후기 | MetroTrip" };

export default async function ReviewDetailPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  let review: ReviewDetail;
  try {
    const response = await fetch(`${apiBase()}/api/v1/reviews/${reviewId}`, { cache: "no-store" });
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error("review unavailable");
    review = (await response.json()) as ReviewDetail;
  } catch { return <main className="centerState"><h1>후기를 불러오지 못했습니다</h1><p>API 실행 상태를 확인한 뒤 다시 시도해 주세요.</p><Link href="/reviews">목록으로</Link></main>; }

  const media = new Map(review.media.map((item) => [item.id, item]));
  const placeRatings = review.placeRatings ?? [];
  return <main className="reviewDetail contentShell"><Link className="backLink" href="/reviews"><ArrowLeft size={16} aria-hidden /> 후기 목록</Link><article><header><p className="eyebrow">TRAVEL REVIEW</p><h1>{review.title}</h1><div className="detailByline"><strong>{review.authorName}</strong><time>{review.travelDate}</time></div><div className="detailRoute"><span><MapPin size={15} aria-hidden /> {review.destinationStationId ? `${review.originStationName} → ${review.destinationStationName}` : `${review.originStationName}역`}</span><span><Star size={15} fill="currentColor" aria-hidden /> {review.rating}</span>{review.costWon !== null ? <span>{review.costWon.toLocaleString("ko-KR")}원</span> : null}</div><ReviewActions reviewId={review.id} authorId={review.authorId} title={review.title} viewCount={review.viewCount} /></header><div className="reviewDocument">{review.blocks.map((block, index) => block.kind === "PARAGRAPH" ? <p key={index}>{block.text}</p> : block.mediaId && media.get(block.mediaId) ? <figure key={index}><img src={media.get(block.mediaId)?.url} alt={block.altText ?? "여행 사진"} /></figure> : null)}</div>{placeRatings.length ? <section className="reviewPlaceRatings"><h2>장소별 평점</h2>{placeRatings.map((item) => <div key={item.placeId}><span>{item.placeName}</span><strong><Star size={14} fill="currentColor" aria-hidden /> {item.rating}</strong></div>)}</section> : null}<div className="detailTags">{review.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><ReviewLike reviewId={review.id} initialLiked={review.likedByMe} initialCount={review.likeCount} /></article></main>;
}
