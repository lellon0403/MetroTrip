"use client";

import type { components } from "@metrotrip/contracts";
import { ArrowLeft, CalendarDays, CalendarClock, MapPinned, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { ClearableInput } from "@/components/ClearableInput";
import { api, applyToRecruitment, getRecruitmentPlan, type PublicRecruitmentPlan } from "@/lib/api";
import { useSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentDetail"];
type Application = components["schemas"]["ApplicationView"];
type ApplicationStatus = Application["status"] | null;

function localDate(value: string) {
  return value.slice(0, 10);
}

function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function apiMessage(error: unknown) {
  if (error && typeof error === "object" && "error" in error) return (error as { error?: { message?: string } }).error?.message ?? "요청을 처리하지 못했습니다.";
  return "요청을 처리하지 못했습니다.";
}

export default function RecruitmentDetailPage({ params }: { params: Promise<{ recruitmentId: string }> }) {
  const { recruitmentId } = use(params);
  const router = useRouter();
  const { status, user } = useSession();
  const [item, setItem] = useState<Recruitment | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [myApplicationStatus, setMyApplicationStatus] = useState<ApplicationStatus>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [linkedPlan, setLinkedPlan] = useState<PublicRecruitmentPlan | null>(null);

  const load = useCallback(async () => {
    const { data, error: apiError } = await api.GET("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: recruitmentId } } });
    if (!data) { setError(apiMessage(apiError)); return; }
    setItem(data);
    if (data.planId) {
      try { setLinkedPlan(await getRecruitmentPlan(recruitmentId)); }
      catch { setLinkedPlan(null); }
    } else setLinkedPlan(null);
    if (user?.id === data.ownerId) {
      const result = await api.GET("/api/v1/recruitments/{recruitment_id}/applications", { params: { path: { recruitment_id: recruitmentId } } });
      setApplications(result.data?.items ?? []);
      setMyApplicationStatus(null);
    } else if (status === "authenticated") {
      const result = await api.GET("/api/v1/me/recruitment-applications");
      const current = result.data?.items.find((application) => application.recruitmentId === recruitmentId);
      setMyApplicationStatus(current?.status ?? null);
    }
  }, [recruitmentId, status, user?.id]);

  useEffect(() => { const task = setTimeout(() => void load(), 0); return () => clearTimeout(task); }, [load]);

  async function apply() {
    try {
      await applyToRecruitment(recruitmentId);
      setMyApplicationStatus("APPLIED");
      setNotice("모집 신청이 접수되었습니다.");
      await load();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "참여 신청을 처리하지 못했습니다.");
    }
  }

  async function cancel() {
    const { error: apiError } = await api.DELETE("/api/v1/recruitments/{recruitment_id}/applications/me", { params: { path: { recruitment_id: recruitmentId } } });
    if (apiError) setError(apiMessage(apiError));
    else { setMyApplicationStatus("CANCELED"); setNotice("신청을 취소했습니다."); await load(); }
  }

  async function decide(id: string, decision: "ACCEPTED" | "REJECTED") {
    const { data, error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}/applications/{application_id}", { params: { path: { recruitment_id: recruitmentId, application_id: id } }, body: { status: decision } });
    if (apiError || !data) setError(apiMessage(apiError));
    else {
      setApplications((current) => decision === "REJECTED" ? current.filter((application) => application.id !== id) : current.map((application) => application.id === id ? data : application));
      if (decision === "ACCEPTED") setItem((current) => current ? { ...current, acceptedCount: current.acceptedCount + 1 } : current);
      setNotice(decision === "ACCEPTED" ? "신청을 수락했습니다." : "신청을 거절했습니다.");
    }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!item) return;
    const form = new FormData(event.currentTarget);
    const meetingValue = String(form.get("meetingAt") ?? "");
    const { data, error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: item.id } }, headers: { "If-Match": `W/"${item.version}"` }, body: { planId: item.planId ?? "", title: String(form.get("title")), body: String(form.get("body")), capacity: Number(form.get("capacity")), deadline: new Date(String(form.get("deadline"))).toISOString(), meetingAt: meetingValue ? new Date(meetingValue).toISOString() : "" } });
    if (data) { setEditing(false); setNotice("모집글을 수정했습니다."); await load(); } else setError(apiMessage(apiError));
  }

  async function closeRecruitment() {
    const { data, error: apiError } = await api.POST("/api/v1/recruitments/{recruitment_id}/close", { params: { path: { recruitment_id: recruitmentId } } });
    if (data) { setNotice("모집을 마감했습니다."); await load(); } else setError(apiMessage(apiError));
  }

  async function deleteRecruitment() {
    if (!window.confirm("모집글을 삭제할까요?")) return;
    const { response } = await api.DELETE("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: recruitmentId } } });
    if (response.ok) router.push("/recruitments"); else setError("모집글을 삭제하지 못했습니다.");
  }

  if (!item) return <main className="centerState"><p>{error ?? "모집글을 불러오는 중…"}</p></main>;
  const owner = user?.id === item.ownerId;
  const isOpen = item.status === "OPEN";

  return (
    <main className="recruitmentDetail recruitmentStory contentShell">
      <Link className="backLink storyBackLink" href="/recruitments"><ArrowLeft size={16} aria-hidden /> 모집 목록으로 돌아가기</Link>

      <section className="storyHero">
        <div className="storyHeroAtmosphere"><span>METROTRIP</span><i /></div>
        <div className="storyHeroContent">
          <div className="storyHeroTopline"><span className={`storyStatus ${isOpen ? "open" : "closed"}`}>{isOpen ? "모집 중" : "모집 마감"}</span><span>함께 떠나는 하루</span></div>
          <h1>{item.title}</h1>
          <p>{item.body}</p>
          <div className="storyHost"><span className="storyAvatar" aria-hidden>{item.ownerName.slice(0, 1)}</span><span><b>{item.ownerName}</b>님이 만든 여행 · {formatDate(item.createdAt)}</span></div>
        </div>
        <div className="storyHeroActions">
          {owner ? <><button type="button" onClick={() => setEditing((value) => !value)}>수정</button>{isOpen ? <button type="button" onClick={() => void closeRecruitment()}>모집 마감</button> : null}<button className="dangerText" type="button" onClick={() => void deleteRecruitment()}>삭제</button></> : null}
        </div>
      </section>

      {notice ? <div className="successBanner storyNotice" role="status">{notice}</div> : null}
      {myApplicationStatus === "ACCEPTED" ? <div className="successBanner storyNotice" role="status">참여 중인 모집입니다.</div> : null}

      <div className="storyLayout">
        <article className="storyArticle">
          {editing ? <form className="recruitmentComposer detailEditor" onSubmit={update}><label>제목<ClearableInput name="title" defaultValue={item.title} minLength={1} required /></label><label>소개<textarea name="body" defaultValue={item.body} minLength={1} rows={6} required /></label><div><label>정원<ClearableInput name="capacity" type="number" min={item.acceptedCount || 1} defaultValue={item.capacity} required /></label><label>신청 마감일<input name="deadline" type="date" defaultValue={localDate(item.deadline)} required /></label><label>만남일 (선택)<input name="meetingAt" type="date" defaultValue={localDate(item.meetingAt)} /></label></div><button className="primaryButton" type="submit">수정 저장</button></form> : <section className="storyIntroduction"><span className="storyEyebrow">TRIP NOTE</span><h2>이런 여행이에요</h2><p>{item.body}</p></section>}
        </article>

        <aside className="storySidebar">
          <section className="tripSummaryCard">
            <span className="storyEyebrow">TRIP SUMMARY</span>
            <h2>자유 모집</h2>
            <div className="tripSummaryRoute"><i /><span>함께 떠나는 여행</span><i /></div>
            <dl><div><dt><CalendarClock size={17} aria-hidden /> 만남일</dt><dd>{formatDate(item.meetingAt)}</dd></div><div><dt><MapPinned size={17} aria-hidden /> 모집 방식</dt><dd>자유 모집</dd></div><div><dt><Users size={17} aria-hidden /> 모집 인원</dt><dd><b>{item.acceptedCount}</b> / {item.capacity}명</dd></div></dl>
            {linkedPlan ? <Link className="storyLinkedPlan" href={`/recruitments/${recruitmentId}/plan`}><span><CalendarDays size={17} aria-hidden /> 공유 일정 · 읽기 전용</span><strong>{linkedPlan.planTitle}</strong><small>{linkedPlan.startStationName} → {linkedPlan.endStationName}</small><ol>{linkedPlan.items.map((planItem) => <li key={planItem.planItemId}><span>{planItem.visitTime.slice(0, 5)}</span>{planItem.placeName}</li>)}</ol><em>일정 전체 보기 →</em></Link> : <span className="storyPlanButton"><CalendarDays size={17} aria-hidden /> {formatDate(item.meetingAt)}</span>}
          </section>
          {!owner && status === "authenticated" ? <section className="storyApplyCard"><span>같은 방향의 여행을 찾고 있다면</span><b>이 모집에 합류해 보세요.</b>{myApplicationStatus && myApplicationStatus !== "CANCELED" ? <button type="button" className="outlineButton" onClick={() => void cancel()}>참여 신청 취소 ({myApplicationStatus})</button> : <button type="button" disabled={!isOpen} onClick={() => void apply()}><UserPlus size={17} aria-hidden /> 참여 신청하기</button>}</section> : !owner ? <section className="storyApplyCard"><Link className="outlineButton" href="/login">로그인 후 참여 신청하기</Link></section> : null}
          {owner ? <section className="applicationPanel storyApplications"><h2>신청자 관리</h2>{applications.length === 0 ? <p>아직 신청자가 없습니다.</p> : applications.map((application) => <div className="applicationRow" key={application.id}><div><strong>{application.applicantName}</strong><span>{application.status}</span></div>{application.status === "APPLIED" ? <div><button type="button" onClick={() => void decide(application.id, "ACCEPTED")}>수락</button><button type="button" onClick={() => void decide(application.id, "REJECTED")}>거절</button></div> : null}</div>)}</section> : null}
        </aside>
      </div>
      {error ? <div className="inlineError"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}
    </main>
  );
}
