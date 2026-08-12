import type { components } from "@metrotrip/contracts";
import { ArrowRight, Bell, CalendarDays } from "lucide-react";
import Link from "next/link";
import { mapLegacyNotice, mapLegacyPlace, mapLegacyRecruitment } from "@/lib/legacyMappers";

type HomeResponse = components["schemas"]["HomeResponse"];

export const dynamic = "force-dynamic";

function apiBase() {
  const configured =
    process.env.API_INTERNAL_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000";
  return configured.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

async function loadHome(): Promise<HomeResponse | null> {
  try {
    const [noticeResponse, recruitmentResponse, stationResponse] = await Promise.all([
      fetch(new URL("/api/v1/notices?size=10", apiBase()), { cache: "no-store" }),
      fetch(new URL("/api/v1/posts?recruit_status=RECRUITING&size=8", apiBase()), { cache: "no-store" }),
      fetch(new URL("/api/v1/stations?keyword=천안&size=20", apiBase()), { cache: "no-store" }),
    ]);
    const noticeData = noticeResponse.ok ? await noticeResponse.json() : { items: [] };
    const recruitmentData = recruitmentResponse.ok ? await recruitmentResponse.json() : { items: [] };
    const stationData = stationResponse.ok ? await stationResponse.json() : { items: [] };
    const station = stationData.items?.find((item: { stationName?: string }) => item.stationName === "천안") ?? stationData.items?.[0];
    const placeResponse = station?.stationId
      ? await fetch(new URL(`/api/v1/stations/${station.stationId}/places?size=100`, apiBase()), { cache: "no-store" })
      : null;
    const placeData = placeResponse?.ok ? await placeResponse.json() : { items: [] };
    const places = (placeData.items ?? []).map((item: Record<string, unknown>) => mapLegacyPlace(item));
    const recruitments = (recruitmentData.items ?? []).map((item: Record<string, unknown>) => mapLegacyRecruitment(item));
    const allNotices = (noticeData.items ?? []).map((item: Record<string, unknown>) => mapLegacyNotice(item));
    return {
      recommendedPlaces: places.slice(0, 6),
      popularPlaces: places.slice(0, 6),
      latestRecruitments: recruitments,
      popularRecruitments: recruitments,
      activeEvents: allNotices.filter((item: { kind: string }) => item.kind === "EVENT"),
      notices: allNotices.filter((item: { kind: string }) => item.kind === "NOTICE"),
    } as HomeResponse;
  } catch {
    return null;
  }
}


export default async function HomePage() {
  const home = await loadHome();
  const places = home?.recommendedPlaces ?? [];
  const popularPlaces = home?.popularPlaces ?? [];
  const recruitments = home?.latestRecruitments ?? [];
  const popularRecruitments = home?.popularRecruitments ?? [];
  const events = home?.activeEvents ?? [];
  const notices = home?.notices ?? [];

  return (
    <main className="homePage">
      <section className="homeHero contentShell">
        <div className="homeHeroCopy">
          <p className="eyebrow">CHEONAN · ASAN METRO JOURNEY</p>
          <h1>역에서 시작하는<br /><em>나만의 하루.</em></h1>
          <p className="lead">
            맛집과 카페를 발견하고, 지도 위에서 순서를 정해 여행을 완성해 보세요.
          </p>
          <div className="heroActions">
            <Link className="primaryButton" href="/discover">여행 시작하기</Link>
            <Link className="textLink" href="/plans">내 일정 보기 <ArrowRight size={15} aria-hidden /></Link>
          </div>
        </div>
        <aside className="homeHeroNotice" aria-label="공지사항">
          <header><span className="iconBadge"><Bell size={18} aria-hidden /></span><div><p className="eyebrow">NOTICE</p><h2>공지사항</h2></div></header>
          {notices.length ? <div className="heroNoticeList">{notices.slice(0, 4).map((notice) => (
            <article key={notice.id}><strong>{notice.title}</strong><time>{notice.publishedAt ? new Date(notice.publishedAt).toLocaleDateString("ko-KR") : "새 소식"}</time></article>
          ))}</div> : <p className="heroNoticeEmpty">새로운 공지사항이 없습니다.</p>}
          {events.slice(0, 1).map((event) => <div className="heroEvent" key={event.id}><CalendarDays size={16} aria-hidden /><span><b>{event.title}</b><small>{event.endsAt ? `${new Date(event.endsAt).toLocaleDateString("ko-KR")}까지` : "진행 중"}</small></span></div>)}
        </aside>
      </section>

      <section className="homeSection contentShell">
        <header className="homeSectionHeader">
          <div><p className="eyebrow">PICK FOR YOU</p><h2>오늘 가볼 만한 장소</h2></div>
          <Link href="/discover">맵에서 모두 보기 <ArrowRight size={15} aria-hidden /></Link>
        </header>
        {places.length ? (
          <div className="homePlaceGrid">
            {places.slice(0, 6).map((place) => (
              <Link key={place.id} href={`/discover?place=${place.id}`} className="homePlaceCard">
                <span className={`homePlaceVisual ${place.category.toLowerCase()}`}>
                  <b>{place.category === "FOOD" ? "맛집" : place.category === "CAFE" ? "카페" : "장소"}</b>
                </span>
                <strong>{place.name}</strong>
                <small>{place.address}</small>
              </Link>
            ))}
          </div>
        ) : <div className="homeEmpty">맵에서 장소를 한 번 불러오면 추천이 채워집니다.</div>}
      </section>

      <section className="homeSection homeTint">
        <div className="contentShell">
          <header className="homeSectionHeader">
            <div><p className="eyebrow">TRENDING NOW</p><h2>지금 많이 저장한 장소</h2></div>
          </header>
          <div className="popularPlaceRail">
            {popularPlaces.slice(0, 6).map((place, index) => (
              <Link key={place.id} href={`/discover?place=${place.id}`} className="popularPlaceItem">
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span><strong>{place.name}</strong><small>저장 {place.favoriteCount} · {place.address}</small></span>
              </Link>
            ))}
            {!popularPlaces.length ? <div className="homeEmpty">아직 저장된 장소가 없습니다.</div> : null}
          </div>
        </div>
      </section>

      <section className="homeSection contentShell homeCommunity">
        <div>
          <header className="homeSectionHeader">
            <div><p className="eyebrow">RECRUITMENT</p><h2>함께 떠날 사람을 찾아요</h2></div>
            <Link href="/recruitments">모집 더 보기 <ArrowRight size={15} aria-hidden /></Link>
          </header>
          <div className="homeFeed">
            {[...popularRecruitments, ...recruitments]
              .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
              .slice(0, 4)
              .map((item) => (
                <Link key={item.id} href={`/recruitments/${item.id}`} className="homeFeedRow" prefetch={false}>
                  <span className="statusPill open">모집 중</span>
                  <div><strong>{item.title}</strong><small>{item.ownerName} · {item.acceptedCount}/{item.capacity}명</small></div>
                  <time>{new Date(item.meetingAt).toLocaleDateString("ko-KR")}</time>
                </Link>
              ))}
            {!recruitments.length ? <div className="homeEmpty">진행 중인 모집이 없습니다.</div> : null}
          </div>
        </div>
        <aside className="homeNoticeBoard">
          <header><p className="eyebrow">LIVE UPDATE</p><h2>이벤트와 공지</h2></header>
          {events.map((event) => (
            <article className="homeEvent" key={event.id}>
              <span>EVENT</span><strong>{event.title}</strong>
              <small>{event.endsAt ? `${new Date(event.endsAt).toLocaleDateString("ko-KR")}까지` : "진행 중"}</small>
            </article>
          ))}
          <div className="homeNotices">
            {notices.map((notice) => (
              <article key={notice.id}><span>공지</span><strong>{notice.title}</strong><time>{notice.publishedAt ? new Date(notice.publishedAt).toLocaleDateString("ko-KR") : ""}</time></article>
            ))}
          </div>
          {!events.length && !notices.length ? <div className="homeEmpty">등록된 이벤트와 공지가 없습니다.</div> : null}
        </aside>
      </section>
    </main>
  );
}
