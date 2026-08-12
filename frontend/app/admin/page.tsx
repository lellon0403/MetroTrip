"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClearableInput } from "@/components/ClearableInput";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Notice = components["schemas"]["NoticeView"];
type Report = components["schemas"]["ReportView"];
type SyncResult = components["schemas"]["DataSyncResult"];
type PlaceRow = { id: string; name: string; dataStatus: string };
type AuditRow = { id: string; action: string; resourceType: string; resourceId: string; reason: string; createdAt: string };

function message(error: unknown): string {
  if (error && typeof error === "object" && "error" in error) {
    const envelope = error as { error?: { message?: string } };
    if (envelope.error?.message) return envelope.error.message;
  }
  return "요청을 처리하지 못했습니다.";
}

export default function AdminPage() {
  const { status, user } = useSession();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [reportStatus, setReportStatus] = useState<"" | "OPEN" | "RESOLVED" | "DISMISSED">("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    try {
      const [noticeResult, reportResult, placeResult, auditResult] = await Promise.all([
        api.GET("/api/v1/admin/notices"),
        api.GET("/api/v1/admin/reports", { params: { query: { status: reportStatus || null } } }),
        api.GET("/api/v1/admin/places"),
        api.GET("/api/v1/admin/audit-logs", { params: { query: { limit: 50 } } }),
      ]);
      const firstError = noticeResult.error ?? reportResult.error ?? placeResult.error ?? auditResult.error;
      if (firstError) setError(message(firstError));
      if (noticeResult.data) setNotices(noticeResult.data.items);
      if (reportResult.data) setReports(reportResult.data.items);
      if (placeResult.data) setPlaces(placeResult.data as PlaceRow[]);
      if (auditResult.data) setAudits(auditResult.data as AuditRow[]);
    } catch {
      setError("운영 데이터를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    }
  }, [reportStatus, status, user?.role]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function createNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const { data, error: apiError } = await api.POST("/api/v1/admin/notices", { body: {
      title: String(form.get("title")), body: String(form.get("body")),
      status: String(form.get("status")) as "DRAFT" | "PUBLISHED",
      kind: String(form.get("kind")) as "NOTICE" | "EVENT",
      bannerUrl: String(form.get("bannerUrl") || "") || null,
      startsAt: form.get("startsAt") ? new Date(String(form.get("startsAt"))).toISOString() : null,
      endsAt: form.get("endsAt") ? new Date(String(form.get("endsAt"))).toISOString() : null,
    } });
    if (!data) return setError(message(apiError));
    formElement.reset();
    setNotice("공지를 저장했습니다.");
    await load();
  }

  async function publishNotice(item: Notice) {
    const { error: apiError } = await api.PUT("/api/v1/admin/notices/{notice_id}", {
      params: { path: { notice_id: item.id } }, body: { title: item.title, body: item.body, status: "PUBLISHED", kind: item.kind, bannerUrl: item.bannerUrl, startsAt: item.startsAt, endsAt: item.endsAt },
    });
    if (apiError) setError(message(apiError)); else { setNotice("공지를 게시했습니다."); await load(); }
  }

  async function resolveReport(item: Report, action: "RESOLVED" | "DISMISSED", hideContent = false) {
    const reason = window.prompt("처리 사유를 입력해 주세요.");
    if (!reason) return;
    const { error: apiError } = await api.POST("/api/v1/admin/reports/{report_id}/actions", {
      params: { path: { report_id: item.id } }, body: { status: action, reason, hideContent },
    });
    if (apiError) setError(message(apiError)); else { setNotice("신고를 처리했습니다."); await load(); }
  }

  async function verifyPlace(placeId: string) {
    const { error: apiError } = await api.POST("/api/v1/admin/places/{place_id}/verify", { params: { path: { place_id: placeId } } });
    if (apiError) setError(message(apiError)); else { setNotice("장소를 검증 상태로 변경했습니다."); await load(); }
  }

  async function startSync(dryRun: boolean) {
    const { data, error: apiError } = await api.POST("/api/v1/admin/data-sync-jobs", { body: { source: "fixture", dryRun } });
    if (!data) setError(message(apiError)); else { setSyncResult(data); await load(); }
  }

  if (status === "loading") return <main className="contentShell statePage"><p>관리자 권한을 확인하고 있습니다.</p></main>;
  if (status === "anonymous") return <main className="contentShell statePage"><h1>로그인이 필요합니다</h1><Link href="/login">로그인하기</Link></main>;
  if (user?.role !== "ADMIN") return <main className="contentShell statePage"><h1>접근 권한이 없습니다</h1><p>관리자 계정에서만 운영 도구를 사용할 수 있습니다.</p></main>;

  return <main className="contentShell adminPage">
    <header className="sectionHeader"><div><p className="eyebrow">OPERATIONS</p><h1>운영 콘솔</h1><p>공지, 신고, 장소 품질과 동기화 이력을 한곳에서 관리합니다.</p></div><button type="button" className="quietButton" onClick={() => void load()}>새로고침</button></header>
    {notice ? <div className="successBanner" role="status">{notice}</div> : null}
    {error ? <div className="inlineError"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}

    <section className="adminPanel"><div className="adminPanelHeader"><div><p className="eyebrow">MODERATION</p><h2>신고 큐</h2></div><select value={reportStatus} onChange={(event) => setReportStatus(event.target.value as typeof reportStatus)}><option value="">전체</option><option value="OPEN">미처리</option><option value="RESOLVED">처리 완료</option><option value="DISMISSED">기각</option></select></div>
      <div className="adminRows">{reports.map((item) => <article className="adminRow" key={item.id}><div><strong>{item.resourceType} · {item.reason}</strong><p>{item.detail ?? "상세 사유 없음"}</p><small>{new Date(item.createdAt).toLocaleString("ko-KR")} · {item.status}</small></div>{item.status === "OPEN" ? <div className="rowActions"><button type="button" onClick={() => void resolveReport(item, "RESOLVED")}>처리</button><button type="button" onClick={() => void resolveReport(item, "RESOLVED", true)}>숨김 처리</button><button type="button" onClick={() => void resolveReport(item, "DISMISSED")}>기각</button></div> : null}</article>)}</div>
    </section>

    <section className="adminGrid"><div className="adminPanel"><h2>공지 · 이벤트 관리</h2><form className="adminForm" onSubmit={createNotice}><label>종류<select name="kind" defaultValue="NOTICE"><option value="NOTICE">공지</option><option value="EVENT">이벤트</option></select></label><label>제목<ClearableInput name="title" minLength={2} required /></label><label>본문<textarea name="body" rows={5} minLength={2} required /></label><label>배너 URL (선택)<ClearableInput name="bannerUrl" type="url" /></label><div className="adminDateFields"><label>시작일<input name="startsAt" type="datetime-local" /></label><label>종료일<input name="endsAt" type="datetime-local" /></label></div><label>상태<select name="status" defaultValue="DRAFT"><option value="DRAFT">초안</option><option value="PUBLISHED">즉시 게시</option></select></label><button className="primaryButton" type="submit">저장</button></form><div className="adminRows compact">{notices.map((item) => <article className="adminRow" key={item.id}><div><strong>{item.title}</strong><small>{item.kind === "EVENT" ? "이벤트" : "공지"} · {item.status}</small></div>{item.status === "DRAFT" ? <button type="button" onClick={() => void publishNotice(item)}>게시</button> : null}</article>)}</div></div>
      <div className="adminPanel"><h2>장소 품질</h2><div className="adminRows compact">{places.map((item) => <article className="adminRow" key={item.id}><div><strong>{item.name}</strong><small>{item.dataStatus}</small></div>{item.dataStatus !== "VERIFIED" ? <button type="button" onClick={() => void verifyPlace(item.id)}>검증 완료</button> : null}</article>)}</div></div>
    </section>

    <section className="adminGrid"><div className="adminPanel"><h2>데이터 동기화</h2><p>먼저 dry-run으로 입력과 잠금을 검증한 뒤 실제 작업을 큐에 등록합니다.</p><div className="rowActions"><button type="button" onClick={() => void startSync(true)}>Dry-run</button><button type="button" onClick={() => void startSync(false)}>동기화 요청</button></div>{syncResult ? <pre className="syncResult">{syncResult.status}\n{syncResult.message}</pre> : null}</div>
      <div className="adminPanel"><h2>최근 감사 로그</h2><div className="adminRows compact auditRows">{audits.map((item) => <article className="adminRow" key={item.id}><div><strong>{item.action}</strong><p>{item.resourceType} · {item.resourceId}</p><small>{item.reason} · {new Date(item.createdAt).toLocaleString("ko-KR")}</small></div></article>)}</div></div>
    </section>
  </main>;
}
