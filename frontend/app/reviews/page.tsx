import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { Search } from "lucide-react";
import { ClearableInput } from "@/components/ClearableInput";
import { mapLegacyReview } from "@/lib/legacyMappers";
import { ReviewMasonry } from "./ReviewMasonry";

type ReviewPage = components["schemas"]["ReviewPage"];

export const dynamic = "force-dynamic";

function apiBase() {
  const configured = process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  return configured.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
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
  if (query) url.searchParams.set("keyword", query);
  if (tag) url.searchParams.set("tag", tag);
  url.searchParams.set("size", "100");
  let data: ReviewPage | null = null;
  let unavailable = false;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const legacy = await response.json();
      data = { items: (legacy.items ?? []).map((item: Record<string, unknown>) => mapLegacyReview(item)), nextCursor: null } as ReviewPage;
    }
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
        <label className="reviewSearchField"><Search size={17} aria-hidden /><span className="srOnly">후기 검색</span><ClearableInput name="query" defaultValue={query} placeholder="제목, 여행지로 검색" /></label>
        <label><span className="srOnly">태그 필터</span><ClearableInput name="tag" defaultValue={tag} placeholder="태그" /></label>
        <select name="sort" defaultValue={sort} aria-label="정렬"><option value="latest">최신순</option><option value="popular">인기순</option></select>
        <button type="submit">검색</button>
      </form>
      {unavailable ? <div className="inlineError reviewError" role="alert"><p>후기 서버에 연결하지 못했습니다. API 실행 상태를 확인해 주세요.</p></div> : null}
      {!unavailable && data?.items.length === 0 ? <div className="emptyState"><strong>조건에 맞는 후기가 없어요</strong><p>검색어를 바꾸거나 첫 후기를 작성해 보세요.</p></div> : null}
      <section aria-label="후기 목록"><ReviewMasonry items={data?.items ?? []} /></section>
    </main>
  );
}
