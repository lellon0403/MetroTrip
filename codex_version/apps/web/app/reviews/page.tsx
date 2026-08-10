import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import type { CSSProperties } from "react";
import { MapPin, Search, Star, ThumbsUp } from "lucide-react";

type ReviewPage = components["schemas"]["ReviewPage"];

export const dynamic = "force-dynamic";

function apiBase() {
  const configured = process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  return configured.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function coverStyle(review: ReviewPage["items"][number]): CSSProperties {
  const width = review.coverWidth || 16;
  const height = review.coverHeight || 10;
  const ratio = Math.min(1.7, Math.max(0.72, width / height));
  return {
    aspectRatio: String(ratio),
    ...(review.coverUrl ? { backgroundImage: `url(${review.coverUrl})` } : {}),
  };
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; tag?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const query = params.query?.trim() ?? "";
  const tag = params.tag?.trim() ?? "";
  const sort = params.sort === "popular" ? "popular" : "latest";
  const url = new URL("/api/v1/reviews", apiBase());
  if (query) url.searchParams.set("query", query);
  if (tag) url.searchParams.set("tag", tag);
  url.searchParams.set("sort", sort);
  let data: ReviewPage | null = null;
  let unavailable = false;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) data = (await response.json()) as ReviewPage;
    else unavailable = true;
  } catch {
    unavailable = true;
  }

  return (
    <main className="reviewsPage contentShell">
      <header className="sectionHeader">
        <div><p className="eyebrow">TRAVEL STORIES</p><h1>여행 후기</h1><p>사진과 이동 경험에서 다음 여행의 단서를 찾아보세요.</p></div>
        <Link className="primaryButton" href="/reviews/new">후기 작성</Link>
      </header>
      <form className="reviewFilters">
        <label className="reviewSearchField"><Search size={17} aria-hidden /><span className="srOnly">후기 검색</span><input name="query" defaultValue={query} placeholder="제목, 여행지로 검색" /></label>
        <label><span className="srOnly">태그 필터</span><input name="tag" defaultValue={tag} placeholder="태그" /></label>
        <select name="sort" defaultValue={sort} aria-label="정렬"><option value="latest">최신순</option><option value="popular">인기순</option></select>
        <button type="submit">검색</button>
      </form>
      {unavailable ? <div className="inlineError reviewError" role="alert"><p>후기 서버에 연결하지 못했습니다. API 실행 상태를 확인해 주세요.</p></div> : null}
      {!unavailable && data?.items.length === 0 ? <div className="emptyState"><strong>조건에 맞는 후기가 없어요</strong><p>검색어를 바꾸거나 첫 후기를 작성해 보세요.</p></div> : null}
      <section className="reviewGrid" aria-label="후기 목록">
        {data?.items.map((review) => {
          const route = review.destinationStationId
            ? `${review.originStationName} → ${review.destinationStationName}`
            : `${review.originStationName}역`;
          return (
            <Link className="reviewCard" href={`/reviews/${review.id}`} key={review.id} prefetch={false}>
              <div className="reviewCover" style={coverStyle(review)}>
                <strong className="reviewRouteOverlay"><MapPin size={13} aria-hidden /> {route}</strong>
                <span>{review.coverUrl ? "" : "METROTRIP"}</span>
              </div>
              <div className="reviewCardBody">
                <div className="reviewCardMeta"><span>{review.authorName}</span><time>{review.travelDate}</time></div>
                <h2>{review.title}</h2>
                <div className="reviewStats"><span><Star size={14} fill="currentColor" aria-hidden /> {review.rating}</span><span className="reviewEngagement">조회 {review.viewCount}<i /> <ThumbsUp size={13} aria-hidden /> 도움 {review.likeCount}</span></div>
                <div className="tagRow">{review.tags.slice(0, 3).map((item) => <span key={item}>#{item}</span>)}{review.tags.length > 3 ? <span>+{review.tags.length - 3}</span> : null}</div>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
