import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";

type Notice = { noticeId: number; title: string; content: string; noticeType: "ALARM" | "BOARD"; createdAt: string; updatedAt: string };
function apiBase() { return (process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/api\/v1\/?$/, "").replace(/\/$/, ""); }
export const dynamic = "force-dynamic";
export const metadata = { title: "공지사항 | MetroTrip" };

export default async function NoticesPage() {
  let notices: Notice[] = [];
  let unavailable = false;
  try {
    const response = await fetch(`${apiBase()}/api/v1/notices?size=100`, { cache: "no-store" });
    if (!response.ok) throw new Error("notice unavailable");
    notices = (await response.json()).items ?? [];
  } catch { unavailable = true; }
  return <main className="noticePage contentShell"><header className="noticePageHero"><p className="eyebrow">METROTRIP NOTICE</p><h1>공지사항</h1><p>서비스 업데이트와 중요한 안내를 확인하세요.</p></header>{unavailable ? <div className="inlineError"><p>공지사항을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p></div> : null}{!unavailable && !notices.length ? <div className="emptyState"><Bell size={24} aria-hidden /><p>등록된 공지사항이 없습니다.</p></div> : null}<section className="noticeList" aria-label="공지사항 목록">{notices.map((notice) => <Link href={`/notices/${notice.noticeId}`} key={notice.noticeId}><span className="adminBadge">{notice.noticeType === "ALARM" ? "알림" : "공지"}</span><div><strong>{notice.title}</strong><p>{notice.content}</p></div><time>{new Date(notice.updatedAt).toLocaleDateString("ko-KR")}</time><ChevronRight size={18} aria-hidden /></Link>)}</section></main>;
}
