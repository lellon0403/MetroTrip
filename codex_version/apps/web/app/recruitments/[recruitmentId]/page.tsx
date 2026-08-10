"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentDetail"];
type Application = components["schemas"]["ApplicationView"];

function localDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  const [message, setMessage] = useState("");
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

  async function apply() { const { error: apiError } = await api.POST("/api/v1/recruitments/{recruitment_id}/applications", { params: { path: { recruitment_id: recruitmentId } }, body: { message: message || null } }); if (apiError) setError(apiMessage(apiError)); else { setNotice("모집 신청을 보냈습니다."); await load(); } }
  async function cancel() { const { error: apiError } = await api.DELETE("/api/v1/recruitments/{recruitment_id}/applications/me", { params: { path: { recruitment_id: recruitmentId } } }); if (apiError) setError(apiMessage(apiError)); else { setNotice("신청을 취소했습니다."); await load(); } }
  async function decide(id: string, decision: "ACCEPTED" | "REJECTED") { const { error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}/applications/{application_id}", { params: { path: { recruitment_id: recruitmentId, application_id: id } }, body: { status: decision } }); if (apiError) setError(apiMessage(apiError)); else await load(); }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!item) return;
    if (!item.planId) { setError("연결된 일정이 삭제되어 모집글을 수정할 수 없습니다."); return; }
    const form = new FormData(event.currentTarget);
    const { data, error: apiError } = await api.PUT("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: item.id } }, headers: { "If-Match": `W/"${item.version}"` }, body: { planId: item.planId, title: String(form.get("title")), body: String(form.get("body")), capacity: Number(form.get("capacity")), deadline: new Date(String(form.get("deadline"))).toISOString(), meetingAt: new Date(String(form.get("meetingAt"))).toISOString() } });
    if (data) { setEditing(false); setNotice("모집글을 수정했습니다."); await load(); } else setError(apiMessage(apiError));
  }

  async function closeRecruitment() { const { data, error: apiError } = await api.POST("/api/v1/recruitments/{recruitment_id}/close", { params: { path: { recruitment_id: recruitmentId } } }); if (data) { setNotice("모집을 마감했습니다."); await load(); } else setError(apiMessage(apiError)); }
  async function deleteRecruitment() { if (!window.confirm("모집글을 삭제할까요? 신청자에게 취소 이벤트가 기록됩니다.")) return; const { response } = await api.DELETE("/api/v1/recruitments/{recruitment_id}", { params: { path: { recruitment_id: recruitmentId } } }); if (response.ok) router.push("/recruitments"); else setError("모집글을 삭제하지 못했습니다."); }
  async function reportRecruitment() { if (status !== "authenticated") { router.push("/login"); return; } const reason = window.prompt("신고 사유를 입력해 주세요."); if (!reason) return; const { data } = await api.POST("/api/v1/recruitments/{recruitment_id}/reports", { params: { path: { recruitment_id: recruitmentId } }, body: { reason } }); if (data) setNotice("신고가 접수됐습니다."); }

  if (!item) return <main className="centerState"><p>{error ?? "모집글을 불러오는 중…"}</p></main>;
  const owner = user?.id === item.ownerId;
  return <main className="recruitmentDetail contentShell"><Link className="backLink" href="/recruitments">← 모집 목록</Link><article><header><div><span className={`statusPill ${item.status.toLowerCase()}`}>{item.status}</span><span>{item.acceptedCount}/{item.capacity}명 수락</span></div><h1>{item.title}</h1><p>{item.ownerName} · {new Date(item.meetingAt).toLocaleString("ko-KR")}</p><p className="linkedPlan">연결 일정 ID: {item.planId}</p>{owner ? <div className="ownerActions"><button type="button" onClick={() => setEditing((value) => !value)}>수정</button>{item.status === "OPEN" && <button type="button" onClick={() => void closeRecruitment()}>마감</button>}<button className="dangerText" type="button" onClick={() => void deleteRecruitment()}>삭제</button></div> : <button className="reportButton" type="button" onClick={() => void reportRecruitment()}>신고</button>}</header>{notice && <div className="successBanner" role="status">{notice}</div>}{editing ? <form className="recruitmentComposer detailEditor" onSubmit={update}><label>제목<input name="title" defaultValue={item.title} minLength={2} required /></label><label>소개<textarea name="body" defaultValue={item.body} minLength={10} rows={6} required /></label><div><label>정원<input name="capacity" type="number" min={item.acceptedCount || 1} max="50" defaultValue={item.capacity} required /></label><label>신청 마감<input name="deadline" type="datetime-local" defaultValue={localDateTime(item.deadline)} required /></label><label>만남 시각<input name="meetingAt" type="datetime-local" defaultValue={localDateTime(item.meetingAt)} required /></label></div><button className="primaryButton" type="submit">수정 저장</button></form> : <div className="recruitmentBody">{item.body}</div>}{!owner ? <section className="applicationPanel"><h2>모집 신청</h2>{status !== "authenticated" ? <Link href="/login">로그인 후 신청하기</Link> : item.myApplicationStatus && item.myApplicationStatus !== "CANCELED" ? <><p>현재 상태: <strong>{item.myApplicationStatus}</strong></p><button type="button" onClick={() => void cancel()}>신청 취소</button></> : <><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="호스트에게 전할 메시지" /><button className="primaryButton" type="button" disabled={item.status !== "OPEN"} onClick={() => void apply()}>신청하기</button></>}</section> : <section className="applicationPanel"><h2>신청자 관리</h2>{applications.length === 0 ? <p>아직 신청자가 없습니다.</p> : applications.map((application) => <div className="applicationRow" key={application.id}><div><strong>{application.applicantName}</strong><p>{application.message ?? "메시지 없음"}</p><span>{application.status}</span></div>{application.status === "APPLIED" ? <div><button type="button" onClick={() => void decide(application.id, "ACCEPTED")}>수락</button><button type="button" onClick={() => void decide(application.id, "REJECTED")}>거절</button></div> : null}</div>)}</section>}{error ? <div className="inlineError"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}</article></main>;
}
