"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { SessionRequestError, useSession } from "@/lib/session";

type Dashboard = {
  plans: components["schemas"]["PlanSummary"][];
  reviews: components["schemas"]["ReviewSummary"][];
  recruitments: components["schemas"]["RecruitmentSummary"][];
  applications: components["schemas"]["ApplicationView"][];
  favorites: components["schemas"]["FavoriteCollection"] | null;
};

const empty: Dashboard = { plans: [], reviews: [], recruitments: [], applications: [], favorites: null };

export default function MyPage() {
  const { status, user, updateProfile, deleteAccount } = useSession();
  const [data, setData] = useState<Dashboard>(empty);
  const [failed, setFailed] = useState<string[]>([]);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const task = setTimeout(() => void (async () => {
      const results = await Promise.allSettled([
        api.GET("/api/v1/plans", { params: { query: { limit: 20 } } }),
        api.GET("/api/v1/me/reviews"),
        api.GET("/api/v1/me/recruitments"),
        api.GET("/api/v1/me/recruitment-applications"),
        api.GET("/api/v1/me/favorites"),
      ]);
      const names = ["일정", "후기", "내 모집", "참여 모집", "즐겨찾기"];
      setFailed(results.flatMap((result, index) => result.status === "rejected" || !result.value.data ? [names[index] ?? "일부 정보"] : []));
      setData({
        plans: results[0]?.status === "fulfilled" ? results[0].value.data?.items ?? [] : [],
        reviews: results[1]?.status === "fulfilled" ? results[1].value.data?.items ?? [] : [],
        recruitments: results[2]?.status === "fulfilled" ? results[2].value.data?.items ?? [] : [],
        applications: results[3]?.status === "fulfilled" ? results[3].value.data?.items ?? [] : [],
        favorites: results[4]?.status === "fulfilled" ? results[4].value.data ?? null : null,
      });
    })(), 0);
    return () => clearTimeout(task);
  }, [status]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountError(null);
    const form = new FormData(event.currentTarget);
    try {
      await updateProfile(String(form.get("displayName")));
      setAccountMessage("프로필을 저장했습니다.");
    } catch (caught) {
      setAccountError(caught instanceof SessionRequestError ? caught.message : "프로필을 저장하지 못했습니다.");
    }
  }

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("deletePassword") ?? "");
    const confirmation = String(form.get("deleteConfirmation") ?? "");
    if (confirmation !== "DELETE") {
      setAccountError("확인란에 DELETE를 정확히 입력해 주세요.");
      return;
    }
    if (!window.confirm("계정을 탈퇴하면 로그인 세션이 종료됩니다. 공개 콘텐츠는 작성자 정보가 익명화된 채 유지됩니다. 계속할까요?")) return;
    setAccountError(null);
    try {
      await deleteAccount(password);
    } catch (caught) {
      setAccountError(caught instanceof SessionRequestError ? caught.message : "계정을 탈퇴 처리하지 못했습니다.");
    }
  }

  if (status === "loading") return <main className="centerState"><p>내 활동을 불러오는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>내 활동은 로그인 후 확인할 수 있어요</h1><Link className="primaryButton" href="/login">로그인</Link></main>;

  return (
    <main className="myPage contentShell">
      <header><p className="eyebrow">MY METROTRIP</p><h1>{user?.displayName}님의 여행</h1><p>계획, 기록, 모집 활동과 저장한 장소를 한곳에서 확인합니다.</p></header>
      {failed.length ? <div className="inlineError reviewError" role="alert"><p>{failed.join(", ")} 정보를 불러오지 못했습니다. 다른 영역은 계속 사용할 수 있습니다.</p></div> : null}
      <section className="myStats"><article><strong>{data.plans.length}</strong><span>일정</span></article><article><strong>{data.reviews.length}</strong><span>후기</span></article><article><strong>{data.recruitments.length}</strong><span>내 모집</span></article><article><strong>{data.applications.length}</strong><span>참여 신청</span></article></section>
      <div className="myColumns">
        <section><div className="mySectionTitle"><h2>최근 일정</h2><Link href="/plans">전체 보기</Link></div>{data.plans.slice(0, 4).map((plan) => <Link className="myRow" key={plan.id} href="/plans"><strong>{plan.title}</strong><span>{plan.startDate} · {plan.status}</span></Link>)}</section>
        <section><div className="mySectionTitle"><h2>내 후기</h2><Link href="/reviews/new">작성</Link></div>{data.reviews.slice(0, 4).map((review) => <Link className="myRow" key={review.id} href={`/reviews/${review.id}`} prefetch={false}><strong>{review.title}</strong><span>★ {review.rating} · ♥ {review.likeCount}</span></Link>)}</section>
        <section><div className="mySectionTitle"><h2>저장한 곳</h2><Link href="/discover">탐색</Link></div>{data.favorites?.stations.slice(0, 3).map((station) => <div className="myRow" key={station.id}><strong>{station.name}역</strong><span>즐겨찾는 역</span></div>)}{data.favorites?.places.slice(0, 3).map((place) => <div className="myRow" key={place.id}><strong>{place.name}</strong><span>{place.category}</span></div>)}</section>
        <section><div className="mySectionTitle"><h2>모집 활동</h2><Link href="/recruitments">전체 보기</Link></div>{data.recruitments.slice(0, 2).map((item) => <Link className="myRow" href={`/recruitments/${item.id}`} key={item.id} prefetch={false}><strong>{item.title}</strong><span>{item.acceptedCount}/{item.capacity}명</span></Link>)}{data.applications.slice(0, 2).map((item) => <Link className="myRow" href={`/recruitments/${item.recruitmentId}`} key={item.id} prefetch={false}><strong>참여 신청</strong><span>{item.status}</span></Link>)}</section>
        <section id="account" className="accountSettings">
          <div className="mySectionTitle"><h2>계정 설정</h2><span>PII 익명화 정책</span></div>
          <form onSubmit={saveProfile}>
            <label>이메일<input value={user?.email ?? ""} disabled /></label>
            <label>표시 이름<input name="displayName" defaultValue={user?.displayName ?? ""} minLength={2} maxLength={40} required /></label>
            <button className="primaryButton" type="submit">프로필 저장</button>
          </form>
          {accountMessage && <p className="formNotice" role="status">{accountMessage}</p>}
          {accountError && <p className="formError" role="alert">{accountError}</p>}
          <form className="dangerZone" onSubmit={removeAccount}>
            <div><strong>회원 탈퇴</strong><p>현재 비밀번호와 DELETE를 입력하면 개인정보를 익명화하고 모든 세션을 폐기합니다.</p></div>
            <label>현재 비밀번호<input name="deletePassword" type="password" autoComplete="current-password" required /></label>
            <label>확인 문구<input name="deleteConfirmation" placeholder="DELETE" autoComplete="off" required /></label>
            <button type="submit">탈퇴</button>
          </form>
        </section>
      </div>
    </main>
  );
}
