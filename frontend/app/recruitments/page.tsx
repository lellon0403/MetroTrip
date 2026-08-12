"use client";

import type { components } from "@metrotrip/contracts";
import { CalendarDays, ChevronRight, Eye, Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ClearableInput } from "@/components/ClearableInput";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentSummary"];
type PlanSummary = components["schemas"]["PlanSummary"];
type RecruitmentStatus = "" | "OPEN" | "CLOSED" | "CANCELED";
type RecruitmentSort = "latest" | "popular" | "closing";

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function apiMessage(error: unknown) {
  if (error && typeof error === "object" && "error" in error) {
    return (error as { error?: { message?: string } }).error?.message ?? "요청을 처리하지 못했습니다.";
  }
  return "요청을 처리하지 못했습니다.";
}

export default function RecruitmentsPage() {
  const { status } = useSession();
  const [items, setItems] = useState<Recruitment[]>([]);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<RecruitmentStatus>("");
  const [sort, setSort] = useState<RecruitmentSort>("latest");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [plans, setPlans] = useState<PlanSummary[]>([]);

  const load = useCallback(async () => {
    try {
      const { data, error: apiError } = await api.GET("/api/v1/recruitments", {
        params: {
          query: {
            query: query.trim() || null,
            status: filterStatus || null,
            sort,
            limit: 30,
          },
        },
      });
      if (data) {
        setItems(data.items);
        setError(null);
      } else {
        setError(apiMessage(apiError));
      }
    } catch {
      setError("모집글을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    }
  }, [filterStatus, query, sort]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(task);
  }, [load]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void api.GET("/api/v1/plans", { params: { query: { limit: 50 } } }).then(({ data }) => setPlans(data?.items ?? []));
  }, [status]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const deadline = new Date(String(form.get("deadline")));
    const meetingValue = String(form.get("meetingAt") ?? "");
    const meetingAt = meetingValue ? new Date(meetingValue) : null;
    if (Number.isNaN(deadline.getTime()) || (meetingAt && Number.isNaN(meetingAt.getTime()))) {
      setError("신청 마감일과 만남일을 확인해 주세요.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const { data, error: apiError } = await api.POST("/api/v1/recruitments", {
        body: {
          planId: String(form.get("planId") ?? ""),
          title: String(form.get("title")),
          body: String(form.get("body")),
          capacity: Number(form.get("capacity")),
          deadline: deadline.toISOString(),
          meetingAt: meetingAt?.toISOString() ?? "",
        },
      });
      if (data) {
        setShowForm(false);
        await load();
      } else {
        setError(apiMessage(apiError));
      }
    } catch {
      setError("모집글을 등록하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  }

  function openComposer() {
    if (status !== "authenticated") {
      setError("로그인 후 모집글을 작성할 수 있어요.");
      return;
    }
    setShowForm((value) => !value);
  }

  return (
    <main className="recruitmentPage contentShell">
      <header className="sectionHeader recruitmentHeader">
        <div>
          <p className="eyebrow">TRAVEL COMMUNITY</p>
          <h1>여행 모집</h1>
          <p>함께 떠날 여행자를 모집하고 신청을 관리해 보세요.</p>
        </div>
        <button className="primaryButton" type="button" onClick={openComposer}>
          모집글 작성
        </button>
      </header>

      <div className="recruitmentToolbar">
        <label className="feedSearch">
          <Search size={17} aria-hidden />
          <span className="srOnly">모집 검색</span>
          <ClearableInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="여행지, 제목, 내용 검색" />
        </label>
        <div className="feedTabs" aria-label="모집 상태">
          {[["", "전체"], ["OPEN", "모집 중"], ["CLOSED", "마감"]].map(([value, label]) => (
            <button key={value || "all"} type="button" aria-pressed={filterStatus === value} onClick={() => setFilterStatus(value as RecruitmentStatus)}>{label}</button>
          ))}
        </div>
        <select aria-label="정렬" value={sort} onChange={(event) => setSort(event.target.value as RecruitmentSort)}>
          <option value="latest">최신순</option>
          <option value="popular">인기순</option>
          <option value="closing">마감 임박순</option>
        </select>
      </div>

      {showForm ? (
        <form className="recruitmentComposer feedComposer" onSubmit={create}>
          <h2>새 모집글</h2>
          <label>공유 일정<select name="planId" defaultValue=""><option value="">일정 없이 자유 모집</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select><small>선택한 일정은 모집글에서 누구나 읽기 전용으로 볼 수 있습니다.</small></label>
          <label>제목<ClearableInput name="title" minLength={1} required /></label>
          <label>소개<textarea name="body" minLength={1} rows={5} required /></label>
          <div>
            <label>정원<ClearableInput name="capacity" type="number" min="1" defaultValue="2" required /></label>
            <label>신청 마감일<input name="deadline" type="date" required /></label>
            <label>만남일 (선택)<input name="meetingAt" type="date" /></label>
          </div>
          <div className="composerSubmit"><button className="primaryButton" type="submit" disabled={creating}>{creating ? "게시 중…" : "게시하기"}</button></div>
        </form>
      ) : null}

      {error ? <div className="inlineError reviewError" role="alert"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}

      <section className="recruitmentFeed redditFeed" aria-label="모집글 목록">
        {items.map((item) => (
          <article key={item.id} className="recruitmentPost">
            <span className="feedAvatar" aria-hidden>{item.ownerName.slice(0, 1)}</span>
            <div className="recruitmentPostBody">
              <header>
                <strong>r/{item.ownerName}</strong><span className="routeSlash">/</span><b>{item.routeLabel}</b><span>·</span>
                <time>{timeLabel(item.createdAt)}</time>
                <span className={`statusPill ${item.status.toLowerCase()}`}>{item.status === "OPEN" ? "모집 중" : item.status === "CLOSED" ? "마감" : "취소"}</span>
              </header>
              <Link href={`/recruitments/${item.id}`} prefetch={false}><h2>{item.title}</h2></Link>
              <p>{item.body}</p>
              <div className="postSchedule"><span><CalendarDays size={14} aria-hidden /> {timeLabel(item.meetingAt)}</span><span>신청 마감 {timeLabel(item.deadline)}</span></div>
              <footer><span><Eye size={13} aria-hidden /> 조회 {item.viewCount}</span><span><Users size={13} aria-hidden /> {item.acceptedCount}/{item.capacity}명</span><span><CalendarDays size={13} aria-hidden /> 만남일</span><Link className="recruitmentApplyLink" href={`/recruitments/${item.id}`}><UserPlus size={14} aria-hidden /> 신청하기 <ChevronRight size={13} aria-hidden /></Link></footer>
            </div>
          </article>
        ))}
      </section>
      {items.length === 0 ? <div className="emptyState"><strong>현재 조건의 모집이 없어요</strong><p>첫 여행 모집을 열어보세요.</p></div> : null}
    </main>
  );
}
