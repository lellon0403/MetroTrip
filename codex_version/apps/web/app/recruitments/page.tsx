"use client";

import type { components } from "@metrotrip/contracts";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Recruitment = components["schemas"]["RecruitmentSummary"];
type Plan = components["schemas"]["PlanSummary"];
type RecruitmentStatus = "" | "OPEN" | "CLOSED" | "CANCELED";
type RecruitmentSort = "latest" | "popular" | "closing";

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function RecruitmentsPage() {
  const { status } = useSession();
  const [items, setItems] = useState<Recruitment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<RecruitmentStatus>("");
  const [sort, setSort] = useState<RecruitmentSort>("latest");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
      setError(JSON.stringify(apiError));
    }
  }, [filterStatus, query, sort]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(task);
  }, [load]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void api.GET("/api/v1/plans", { params: { query: { limit: 50 } } })
      .then(({ data }) => setPlans(data?.items ?? []));
  }, [status]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { data, error: apiError } = await api.POST("/api/v1/recruitments", {
      body: {
        planId: String(form.get("plan")),
        title: String(form.get("title")),
        body: String(form.get("body")),
        capacity: Number(form.get("capacity")),
        deadline: new Date(String(form.get("deadline"))).toISOString(),
        meetingAt: new Date(String(form.get("meetingAt"))).toISOString(),
      },
    });
    if (data) {
      setShowForm(false);
      event.currentTarget.reset();
      await load();
    } else {
      setError(JSON.stringify(apiError));
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
          <p>일정을 공유하고 같은 방향의 여행자를 만나보세요.</p>
        </div>
        <button className="primaryButton" type="button" onClick={openComposer}>
          모집글 작성
        </button>
      </header>

      <div className="recruitmentToolbar">
        <label className="feedSearch">
          <span aria-hidden>⌕</span>
          <span className="srOnly">모집 검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="여행지, 제목, 내용 검색" />
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
          <label>연결 일정<select name="plan" required defaultValue=""><option value="" disabled>일정 선택</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>
          <label>제목<input name="title" minLength={2} required /></label>
          <label>소개<textarea name="body" minLength={10} rows={5} required /></label>
          <div>
            <label>정원<input name="capacity" type="number" min="1" max="50" defaultValue="2" required /></label>
            <label>신청 마감<input name="deadline" type="datetime-local" required /></label>
            <label>만남 시각<input name="meetingAt" type="datetime-local" required /></label>
          </div>
          <div className="composerSubmit"><button className="primaryButton" type="submit">게시하기</button></div>
        </form>
      ) : null}

      {error ? <div className="inlineError reviewError" role="alert"><p>{error}</p><button type="button" onClick={() => setError(null)}>닫기</button></div> : null}

      <section className="recruitmentFeed" aria-label="모집글 목록">
        {items.map((item) => (
          <Link key={item.id} href={`/recruitments/${item.id}`} className="recruitmentPost" prefetch={false}>
            <span className="feedAvatar" aria-hidden>{item.ownerName.slice(0, 1)}</span>
            <article>
              <header>
                <strong>{item.ownerName}</strong>
                <span>·</span>
                <time>{timeLabel(item.createdAt)}</time>
                <span className={`statusPill ${item.status.toLowerCase()}`}>{item.status === "OPEN" ? "모집 중" : item.status === "CLOSED" ? "마감" : "취소"}</span>
              </header>
              <h2>{item.title}</h2>
              <p>{item.body}</p>
              <div className="postSchedule"><span>◷ {timeLabel(item.meetingAt)}</span><span>신청 마감 {timeLabel(item.deadline)}</span></div>
              <footer><span>◉ 조회 {item.viewCount}</span><span>♙ {item.acceptedCount}/{item.capacity}명</span><span>일정 보기 →</span></footer>
            </article>
          </Link>
        ))}
      </section>
      {items.length === 0 ? <div className="emptyState"><strong>현재 조건의 모집이 없어요</strong><p>첫 여행 모집을 열어보세요.</p></div> : null}
    </main>
  );
}