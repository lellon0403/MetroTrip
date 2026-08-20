"use client";

import type { components } from "@metrotrip/contracts";
import { Star, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ClearableInput } from "@/components/ClearableInput";
import { api } from "@/lib/api";
import { SessionRequestError, useSession } from "@/lib/session";

type Dashboard = {
  plans: components["schemas"]["PlanSummary"][];
  reviews: components["schemas"]["ReviewSummary"][];
  recruitments: components["schemas"]["RecruitmentSummary"][];
  applications: components["schemas"]["ApplicationView"][];
  favorites: components["schemas"]["FavoriteCollection"] | null;
};

type MyPanel = "dashboard" | "recentPlans" | "favorites" | "reviews" | "recruitments" | "account";
type AccountOption = "profile" | "password" | "withdrawal";
type RecruitmentTab = "owned" | "applied";
type MyApplication = components["schemas"]["ApplicationView"] & { recruitmentTitle?: string; meetingAt?: string | null };

const empty: Dashboard = { plans: [], reviews: [], recruitments: [], applications: [], favorites: null };

export default function MyPage() {
  const { status, user, updateProfile, changePassword, deleteAccount } = useSession();
  const router = useRouter();
  const [data, setData] = useState<Dashboard>(empty);
  const [failed, setFailed] = useState<string[]>([]);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MyPanel>("dashboard");
  const [activeAccountOption, setActiveAccountOption] = useState<AccountOption>("profile");
  const [recruitmentTab, setRecruitmentTab] = useState<RecruitmentTab>("owned");

  function selectAccountOption(option: AccountOption) {
    setActiveAccountOption(option);
    setAccountMessage(null);
    setAccountError(null);
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    const task = setTimeout(() => void (async () => {
      const results = await Promise.allSettled([
        api.GET("/api/v1/plans", { params: { query: { limit: 100 } } }),
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
      await updateProfile(String(form.get("displayName")), String(form.get("profilePassword")));
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

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const newPasswordConfirm = String(form.get("newPasswordConfirm") ?? "");
    if (newPassword !== newPasswordConfirm) {
      setAccountError("새 비밀번호와 확인 값이 일치하지 않습니다.");
      return;
    }
    setAccountError(null);
    try {
      await changePassword(currentPassword, newPassword, newPasswordConfirm);
      window.alert("비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.");
      router.push("/login");
    } catch (caught) {
      setAccountError(caught instanceof SessionRequestError ? caught.message : "비밀번호를 변경하지 못했습니다.");
    }
  }

  async function deleteOwnedRecruitment(id: string, title: string) {
    if (!window.confirm(`‘${title}’ 모집글을 삭제할까요?`)) return;
    const { response } = await api.DELETE("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: id } } });
    if (response.ok) setData((current) => ({ ...current, recruitments: current.recruitments.filter((item) => item.id !== id) }));
    else setAccountError("모집글을 삭제하지 못했습니다.");
  }

  async function leaveRecruitment(application: MyApplication) {
    const meetingAt = application.meetingAt ? new Date(application.meetingAt) : null;
    const upcoming = Boolean(meetingAt && !Number.isNaN(meetingAt.getTime()) && meetingAt >= new Date());
    if (application.status === "ACCEPTED" && upcoming) {
      if (window.prompt("예정된 모집에서 탈퇴하려면 ‘해당 모집에서 탈퇴합니다’를 입력해 주세요.") !== "해당 모집에서 탈퇴합니다") return;
    } else if (!window.confirm("신청 목록에서 삭제할까요?")) return;
    const { error: apiError } = await api.DELETE("/api/v1/recruitments/{recruitment_id}/applications/me", { params: { path: { recruitment_id: application.recruitmentId } } });
    if (apiError) setAccountError("모집 신청을 삭제하지 못했습니다.");
    else setData((current) => ({ ...current, applications: current.applications.filter((item) => item.id !== application.id) }));
  }

  if (status === "loading") return <main className="centerState"><p>내 활동을 불러오는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>내 활동은 로그인 후 확인할 수 있어요</h1><Link className="primaryButton" href="/login">로그인</Link></main>;

  return (
    <main className="myPage contentShell">
      <div className="myDashboardLayout">
        <aside className="mySidebar" aria-label="마이페이지 메뉴">
          <p className="mySidebarEyebrow">MY PAGE</p>
          <nav>
            <button className={activePanel === "dashboard" ? "isActive" : ""} type="button" onClick={() => setActivePanel("dashboard")}>대시보드</button>
            <button className={activePanel === "recentPlans" ? "isActive" : ""} type="button" onClick={() => setActivePanel("recentPlans")}>최근 일정</button>
            <button className={activePanel === "favorites" ? "isActive" : ""} type="button" onClick={() => setActivePanel("favorites")}>즐겨찾는 역</button>
            <button className={activePanel === "reviews" ? "isActive" : ""} type="button" onClick={() => setActivePanel("reviews")}>후기 관리</button>
            <button className={activePanel === "recruitments" ? "isActive" : ""} type="button" onClick={() => setActivePanel("recruitments")}>모집 활동</button>
            <button className={activePanel === "account" ? "isActive" : ""} type="button" onClick={() => setActivePanel("account")}>계정 설정</button>
          </nav>
        </aside>
        <div className="myDashboardContent" data-panel={activePanel}>
      <header><p className="eyebrow">MY METROTRIP</p><h1>{user?.displayName}님의 여행</h1><p>계획, 기록, 모집 활동과 즐겨찾는 역을 한곳에서 확인합니다.</p></header>
      {failed.length ? <div className="inlineError reviewError" role="alert"><p>{failed.join(", ")} 정보를 불러오지 못했습니다. 다른 영역은 계속 사용할 수 있습니다.</p></div> : null}
      <section className="myStats"><article><strong>{data.plans.length}</strong><span>일정</span></article><article><strong>{data.reviews.length}</strong><span>후기</span></article><article><strong>{data.recruitments.length}</strong><span>내 모집</span></article><article><strong>{data.applications.length}</strong><span>참여 신청</span></article></section>
      <div className="myColumns">
        <section><div className="mySectionTitle"><h2>최근 일정</h2><Link href="/plans">전체 보기</Link></div>{data.plans.map((plan) => <Link className="myRow" key={plan.id} href="/plans"><strong>{plan.title}</strong><span>{plan.startDate} · {plan.status}</span></Link>)}</section>
        <section><div className="mySectionTitle"><h2>내 후기</h2><Link href="/reviews/new">작성</Link></div>{data.reviews.map((review) => <Link className="myRow" key={review.id} href={`/reviews/${review.id}`} prefetch={false}><strong>{review.title}</strong><span><Star size={13} fill="currentColor" aria-hidden /> {review.rating} · <ThumbsUp size={12} aria-hidden /> {review.likeCount}</span></Link>)}</section>
        <section><div className="mySectionTitle"><h2>즐겨찾는 역</h2><Link href="/discover">탐색</Link></div>{data.favorites?.stations.map((station) => <div className="myRow" key={station.id}><strong>{station.name}역</strong><span>즐겨찾는 역</span></div>)}</section>
        <section><div className="mySectionTitle"><h2>모집 활동</h2><Link href="/recruitments">전체 보기</Link></div><div className="accountOptionList recruitmentActivityTabs" role="tablist"><button className={recruitmentTab === "owned" ? "isActive" : ""} onClick={() => setRecruitmentTab("owned")}>내가 작성한 모집글</button><button className={recruitmentTab === "applied" ? "isActive" : ""} onClick={() => setRecruitmentTab("applied")}>내가 신청한 모집글</button></div>{recruitmentTab === "owned" ? data.recruitments.map((item) => <div className="myRecruitmentRow" key={item.id}><Link className="myRow" href={`/recruitments/${item.id}`} prefetch={false}><strong>{item.title}</strong><span>{item.acceptedCount}/{item.capacity}명</span></Link><button aria-label={`${item.title} 삭제`} onClick={() => void deleteOwnedRecruitment(item.id, item.title)}><Trash2 size={16} /></button></div>) : (data.applications as MyApplication[]).map((item) => <div className="myRecruitmentRow" key={item.id}><Link className="myRow" href={`/recruitments/${item.recruitmentId}`} prefetch={false}><strong>{item.recruitmentTitle ?? "참여 신청 모집글"}</strong><span>{item.status === "ACCEPTED" ? "수락" : "신청 완료"}</span></Link><button aria-label={`${item.recruitmentTitle ?? "모집 신청"} 삭제`} onClick={() => void leaveRecruitment(item)}><Trash2 size={16} /></button></div>)}</section>
        <section id="account" className="accountSettings">
          <div className="mySectionTitle"><h2>계정 설정</h2><span>PII 익명화 정책</span></div>
          <div className="accountOptionList" role="tablist" aria-label="계정 설정 옵션">
            <button className={activeAccountOption === "profile" ? "isActive" : ""} type="button" role="tab" aria-selected={activeAccountOption === "profile"} onClick={() => selectAccountOption("profile")}>프로필 관리</button>
            <button className={activeAccountOption === "password" ? "isActive" : ""} type="button" role="tab" aria-selected={activeAccountOption === "password"} onClick={() => selectAccountOption("password")}>비밀번호 변경</button>
            <button className={activeAccountOption === "withdrawal" ? "isDanger" : ""} type="button" role="tab" aria-selected={activeAccountOption === "withdrawal"} onClick={() => selectAccountOption("withdrawal")}>회원 탈퇴</button>
          </div>
          <div className={`accountOptionPanel ${activeAccountOption === "withdrawal" ? "isDanger" : ""}`} role="tabpanel">
            {activeAccountOption === "profile" ? <form onSubmit={saveProfile}>
              <label>이메일<ClearableInput value={user?.email ?? ""} disabled /></label>
              <label>표시 이름<ClearableInput name="displayName" defaultValue={user?.displayName ?? ""} minLength={2} maxLength={40} required /></label>
              <label>현재 비밀번호<ClearableInput name="profilePassword" type="password" autoComplete="current-password" required /></label>
              <button className="primaryButton" type="submit">프로필 저장</button>
              {accountMessage && <p className="formNotice" role="status">{accountMessage}</p>}
            </form> : null}
            {activeAccountOption === "password" ? <form onSubmit={updatePassword}>
              <div><strong>비밀번호 변경</strong><p>현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 변경 후에는 다시 로그인해야 합니다.</p></div>
              <label>현재 비밀번호<ClearableInput name="currentPassword" type="password" autoComplete="current-password" required /></label>
              <label>새 비밀번호<ClearableInput name="newPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label>새 비밀번호 확인<ClearableInput name="newPasswordConfirm" type="password" minLength={8} autoComplete="new-password" required /></label>
              <button className="primaryButton" type="submit">비밀번호 변경</button>
            </form> : null}
            {activeAccountOption === "withdrawal" ? <form className="dangerZone" onSubmit={removeAccount}>
              <div><strong>회원 탈퇴</strong><p>현재 비밀번호와 DELETE를 입력하면 개인정보를 익명화하고 모든 세션을 폐기합니다.</p></div>
              <label>현재 비밀번호<ClearableInput name="deletePassword" type="password" autoComplete="current-password" required /></label>
              <label>확인 문구<ClearableInput name="deleteConfirmation" placeholder="DELETE" autoComplete="off" required /></label>
              <button type="submit">탈퇴</button>
            </form> : null}
            {accountError && <p className="formError" role="alert">{accountError}</p>}
          </div>
        </section>
      </div>
      </div>
      </div>
    </main>
  );
}
