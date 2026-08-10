"use client";

import type { components } from "@metrotrip/contracts";
import { ArrowLeft, CalendarDays, CalendarClock, Flag, MapPinned, MessageCircle, Send, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentDetail"];
type Application = components["schemas"]["ApplicationView"];
type RecruitmentComment = components["schemas"]["RecruitmentCommentView"];

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
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
  const [commentBody, setCommentBody] = useState("");
  const [commentKind, setCommentKind] = useState<"QUESTION" | "APPLICATION">("QUESTION");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: apiError } = await api.GET("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: recruitmentId } } });
    if (!data) { setError(apiMessage(apiError)); return; }
    setItem(data);
    if (user?.id === data.ownerId) {
      const result = await api.GET("/api/v1/recruitments/{recruitment_id}/applications", { params: { path: { recruitment_id: recruitmentId } } });
      setApplications(result.data?.items ?? []);
    }
  }, [recruitmentId, user?.id]);

  useEffect(() => { const task = setTimeout(() => void load(), 0); return () => clearTimeout(task); }, [load]);

  async function postComment() {
    if (!commentBody.trim()) return;
    const { error: apiError } = await api.POST("/api/v1/recruitments/{recruitment_id}/comments", { params: { path: { recruitment_id: recruitmentId } }, body: { kind: commentKind, body: commentBody.trim() } });
    if (apiError) setError(apiMessage(apiError));
    else { setCommentBody(""); setNotice(commentKind === "APPLICATION" ? "모집 신청이 접수되었습니다." : "질문을 등록했습니다."); await load(); }
  }

  async function cancel() {
    const { error: apiError } = await api.DELETE("/api/v1/recruitments/{recruitment_id}/applications/me", { params: { path: { recruitment_id: recruitmentId } } });
    if (apiError) setError(apiMessage(apiError));
    else { setNotice("신청을 취소했습니다."); await load(); }
  }

  async function decide(id: string, decision: "ACCEPTED" | "REJECTED") {
    const { error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}/applications/{application_id}", { params: { path: { recruitment_id: recruitmentId, application_id: id } }, body: { status: decision } });
    if (apiError) setError(apiMessage(apiError)); else await load();
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!item) return;
    if (!item.planId) { setError("연결된 일정이 없어서 모집글을 수정할 수 없습니다."); return; }
    const form = new FormData(event.currentTarget);
    const { data, error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: item.id } }, headers: { "If-Match": `W/"${item.version}"` }, body: { planId: item.planId, title: String(form.get("title")), body: String(form.get("body")), capacity: Number(form.get("capacity")), deadline: new Date(String(form.get("deadline"))).toISOString(), meetingAt: new Date(String(form.get("meetingAt"))).toISOString() } });
    if (data) { setEditing(false); setNotice("모집글을 수정했습니다."); await load(); } else setError(apiMessage(apiError));
  }

  async function closeRecruitment() {
    const { data, error: apiError } = await api.POST("/api/v1/recruitments/{recruitment_id}/close", { params: { path: { recruitment_id: recruitmentId } } });
    if (data) { setNotice("모집을 마감했습니다."); await load(); } else setError(apiMessage(apiError));
  }

  async function deleteRecruitment() {
    if (!window.confirm("모집글을 삭제할까요? 신청자에게 취소 이벤트가 기록됩니다.")) return;
    const { response } = await api.DELETE("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: recruitmentId } } });
    if (response.ok) router.push("/recruitments"); else setError("모집글을 삭제하지 못했습니다.");
  }

  async function reportRecruitment() {
    if (status !== "authenticated") { router.push("/login"); return; }
    const reason = window.prompt("신고 사유를 입력해 주세요.");
    if (!reason) return;
    const { data } = await api.POST("/api/v1/recruitments/{recruitment_id}/reports", { params: { path: { recruitment_id: recruitmentId } }, body: { reason } });
    if (data) setNotice("신고가 접수되었습니다.");
  }

  if (!item) return <main className="centerState"><p>{error ?? "모집글을 불러오는 중…"}</p></main>;
  const owner = user?.id === item.ownerId;
  const comments = item.comments as RecruitmentComment[];
  const isOpen = item.status === "OPEN";

  return (
    <main className="recruitmentDetail recruitmentStory contentShell">
      <Link className="backLink storyBackLink" href="/recruitments"><ArrowLeft size={16} aria-hidden /> 동행 모집으로 돌아가기</Link>

      <section className="storyHero">
        <div className="storyHeroAtmosphere"><span>METROTRIP</span><i /></div>
        <div className="storyHeroContent">
          <div className="storyHeroTopline"><span className={`storyStatus ${isOpen ? "open" : "closed"}`}>{isOpen ? "모집 중" : "모집 마감"}</span><span>함께 떠나는 하루</span></div>
          <h1>{item.title}</h1>
          <p>{item.body}</p>
          <div className="storyHost"><span className="storyAvatar" aria-hidden>{item.ownerName.slice(0, 1)}</span><span><b>{item.ownerName}</b>님이 만든 여행 · {formatDate(item.createdAt)}</span></div>
        </div>
        <div className="storyHeroActions">
          {owner ? <><button type="button" onClick={() => setEditing((value) => !value)}>수정</button>{isOpen ? <button type="button" onClick={() => void closeRecruitment()}>모집 마감</button> : null}<button className="dangerText" type="button" onClick={() => void deleteRecruitment()}>삭제</button></> : <button type="button" aria-label="신고" onClick={() => void reportRecruitment()}><Flag size={16} aria-hidden /> 신고</button>}
        </div>
      </section>

      {notice ? <div className="successBanner storyNotice" role="status">{notice}</div> : null}

      <div className="storyLayout">
        <article className="storyArticle">
          {editing ? <form className="recruitmentComposer detailEditor" onSubmit={update}><label>제목<input name="title" defaultValue={item.title} minLength={2} required /></label><label>소개<textarea name="body" defaultValue={item.body} minLength={10} rows={6} required /></label><div><label>정원<input name="capacity" type="number" min={item.acceptedCount || 1} max="50" defaultValue={item.capacity} required /></label><label>신청 마감<input name="deadline" type="datetime-local" defaultValue={localDateTime(item.deadline)} required /></label><label>만남 시각<input name="meetingAt" type="datetime-local" defaultValue={localDateTime(item.meetingAt)} required /></label></div><button className="primaryButton" type="submit">수정 저장</button></form> : <section className="storyIntroduction"><span className="storyEyebrow">TRIP NOTE</span><h2>이런 여행이에요</h2><p>{item.body}</p></section>}

          <section className="discussionPanel storyDiscussion">
            <div className="storySectionHeading"><div><span className="storyEyebrow">CONVERSATION</span><h2>여행에 대해 이야기해요 <em>{comments.length}</em></h2></div><MessageCircle size={22} aria-hidden /></div>
            {comments.length === 0 ? <p className="storyEmptyComment">아직 첫 대화가 없어요. 궁금한 점을 가장 먼저 남겨 보세요.</p> : comments.map((comment) => <article key={comment.id} className={`discussionComment ${comment.kind.toLowerCase()}`}><div className="commentAvatar" aria-hidden>{comment.authorName.slice(0, 1)}</div><div><strong>{comment.authorName}</strong><small>{comment.kind === "APPLICATION" ? "동행 신청" : "질문"} · {formatDate(comment.createdAt, true)}</small><p>{comment.body}</p></div></article>)}
            {status === "authenticated" ? item.myApplicationStatus && item.myApplicationStatus !== "CANCELED" ? <button type="button" className="outlineButton" onClick={() => void cancel()}>동행 신청 취소 ({item.myApplicationStatus})</button> : <div className="discussionComposer storyComposer"><div className="composerKinds"><button type="button" aria-pressed={commentKind === "QUESTION"} onClick={() => setCommentKind("QUESTION")}>질문 남기기</button><button type="button" aria-pressed={commentKind === "APPLICATION"} onClick={() => setCommentKind("APPLICATION")}>동행 신청</button></div><textarea id="recruitment-discussion" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={commentKind === "APPLICATION" ? "함께하고 싶은 이유를 편하게 들려주세요." : "여행에 관해 궁금한 점을 남겨주세요."} /><button className="primaryButton" type="button" disabled={!isOpen && commentKind === "APPLICATION"} onClick={() => void postComment()}><Send size={15} aria-hidden /> {commentKind === "APPLICATION" ? "신청 보내기" : "질문 등록"}</button></div> : <Link className="outlineButton" href="/login">로그인 후 대화 참여하기</Link>}
          </section>
        </article>

        <aside className="storySidebar">
          <section className="tripSummaryCard">
            <span className="storyEyebrow">TRIP SUMMARY</span>
            <h2>{item.routeLabel}</h2>
            <div className="tripSummaryRoute"><i /><span>지하철로 이어지는 여행</span><i /></div>
            <dl><div><dt><CalendarClock size={17} aria-hidden /> 만남</dt><dd>{formatDate(item.meetingAt, true)}</dd></div><div><dt><MapPinned size={17} aria-hidden /> 노선</dt><dd>{item.routeLabel}</dd></div><div><dt><Users size={17} aria-hidden /> 동행 인원</dt><dd><b>{item.acceptedCount}</b> / {item.capacity}명</dd></div></dl>
            {item.planId ? <Link className="storyPlanButton" href={`/discover?recruitmentPlan=${item.id}`}><CalendarDays size={17} aria-hidden /> 지도에서 일정 보기</Link> : null}
          </section>
          {!owner && status === "authenticated" && !item.myApplicationStatus ? <section className="storyApplyCard"><span>같은 방향의 여행을 찾고 있다면</span><b>이 동행에 합류해 보세요.</b><button type="button" disabled={!isOpen} onClick={() => { setCommentKind("APPLICATION"); document.getElementById("recruitment-discussion")?.focus(); }}><UserPlus size={17} aria-hidden /> 동행 신청하기</button></section> : null}
          {owner ? <section className="applicationPanel storyApplications"><h2>신청자 관리</h2>{applications.length === 0 ? <p>아직 신청자가 없습니다.</p> : applications.map((application) => <div className="applicationRow" key={application.id}><div><strong>{application.applicantName}</strong><p>{application.message ?? "메시지 없음"}</p><span>{application.status}</span></div>{application.status === "APPLIED" ? <div><button type="button" onClick={() => void decide(application.id, "ACCEPTED")}>수락</button><button type="button" onClick={() => void decide(application.id, "REJECTED")}>거절</button></div> : null}</div>)}</section> : null}
        </aside>
      </div>
      {error ? <div className="inlineError"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}
    </main>
  );
}
