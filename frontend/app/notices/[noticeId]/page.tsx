import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

type Notice = { noticeId: number; title: string; content: string; noticeType: "ALARM" | "BOARD"; createdAt: string; updatedAt: string };
function apiBase() { return (process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/api\/v1\/?$/, "").replace(/\/$/, ""); }
export const dynamic = "force-dynamic";
export const metadata = { title: "공지사항 | MetroTrip" };

export default async function NoticeDetailPage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await params;
  let notice: Notice;
  try {
    const response = await fetch(`${apiBase()}/api/v1/notices/${noticeId}`, { cache: "no-store" });
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error("notice unavailable");
    notice = await response.json();
  } catch { return <main className="centerState"><h1>공지사항을 불러오지 못했습니다.</h1><Link href="/notices">공지 목록으로</Link></main>; }
  return <main className="reviewDetail noticeDetail contentShell"><Link className="backLink" href="/notices"><ArrowLeft size={16} aria-hidden /> 공지 목록</Link><article><header><p className="eyebrow">{notice.noticeType === "ALARM" ? "SERVICE ALERT" : "METROTRIP NOTICE"} <time>{new Date(notice.updatedAt).toLocaleDateString("ko-KR")}</time></p><h1>{notice.title}</h1></header><div className="reviewDocument noticeDocument">{notice.content.split("\n").map((line, index) => <p key={index}>{line || "\u00a0"}</p>)}</div></article></main>;
}
