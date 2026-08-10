import type { components } from "@metrotrip/contracts";
import Link from "next/link";

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
    const response = await fetch(new URL("/api/v1/home", apiBase()), {
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as HomeResponse) : null;
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
        <div>
          <p className="eyebrow">CHEONAN · ASAN METRO JOURNEY</p>
          <h1>역에서 시작하는<br /><em>나만의 하루.</em></h1>
          <p className="lead">
            맛집과 카페를 발견하고, 지도 위에서 순서를 정해 여행을 완성해 보세요.
          </p>
          <div className="heroActions">
            <Link className="primaryButton" href="/discover">여행 시작하기</Link>
            <Link className="textLink" href="/plans">내 일정 보기 →</Link>
          </div>
        </div>
        <div className="homeHeroMap" aria-hidden="true">
          <span className="heroStation one">천안역</span>
          <span className="heroPlace two">빵집</span>
          <span className="heroPlace three">카페</span>
          <span className="heroStation four">아산역</span>
          <svg viewBox="0 0 600 380"><path d="M80 280 C180 80 300 340 510 100" /></svg>
        </div>
      </section>

      <section className="homeSection contentShell">
        <header className="homeSectionHeader">
          <div><p className="eyebrow">PICK FOR YOU</p><h2>오늘 가볼 만한 장소</h2></div>
          <Link href="/discover">맵에서 모두 보기 →</Link>
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
            <Link href="/recruitments">모집 더 보기 →</Link>
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
