"use client";

import { BellRing, MapPin, MessageSquareWarning, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminApi, type NoticeAdmin, type PlaceAdminInput, type PostAdmin, type ReviewAdmin } from "@/lib/adminApi";
import { useSession } from "@/lib/session";

type Section = "notices" | "content" | "places";

function placeBody(form: FormData): PlaceAdminInput {
  const selectedCategory = String(form.get("category") ?? "FOOD");
  const category = ({ FOOD: "RESTAURANT", CULTURE: "TOUR", NATURE: "TOUR", STAY: "ETC" } as Record<string, string>)[selectedCategory] ?? selectedCategory;
  return {
    placeName: String(form.get("placeName") ?? "").trim(), category,
    description: String(form.get("description") ?? "").trim() || null, address: String(form.get("address") ?? "").trim(),
    latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")), phone: String(form.get("phone") ?? "").trim() || null,
    stationIds: String(form.get("stationIds") ?? "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0),
    imageUrls: String(form.get("imageUrls") ?? "").split("\n").map((value) => value.trim()).filter(Boolean),
  };
}

export default function AdminPage() {
  const { status, user } = useSession();
  const [section, setSection] = useState<Section>("notices");
  const [notices, setNotices] = useState<NoticeAdmin[]>([]);
  const [reviews, setReviews] = useState<ReviewAdmin[]>([]);
  const [posts, setPosts] = useState<PostAdmin[]>([]);
  const [editingNotice, setEditingNotice] = useState<NoticeAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated" || user?.role !== "ADMIN") return;
    try {
      const [noticeData, reviewData, postData] = await Promise.all([adminApi.listNotices(), adminApi.listReviews(), adminApi.listPosts()]);
      setNotices(noticeData.items); setReviews(reviewData.items); setPosts(postData.items); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "관리자 데이터를 불러오지 못했습니다."); }
  }, [status, user?.role]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function saveNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const body = { title: String(data.get("title")), content: String(data.get("content")), noticeType: String(data.get("noticeType")) };
    try {
      if (editingNotice) await adminApi.updateNotice(editingNotice.noticeId, body);
      else await adminApi.createNotice(body);
      setEditingNotice(null); form.reset(); setFeedback(editingNotice ? "공지를 수정했습니다." : "공지를 추가했습니다."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "공지를 저장하지 못했습니다."); }
  }

  async function remove(kind: "notice" | "review" | "post" | "place", id: number, label: string) {
    if (!window.confirm(`‘${label}’을(를) 삭제할까요? 이 작업은 되돌리기 어렵습니다.`)) return;
    try {
      if (kind === "notice") await adminApi.deleteNotice(id); else if (kind === "review") await adminApi.deleteReview(id); else if (kind === "post") await adminApi.deletePost(id); else await adminApi.deletePlace(id);
      setFeedback("삭제했습니다."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다."); }
  }

  async function savePlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const id = Number(data.get("placeId")); const body = placeBody(data);
    if (!body.stationIds.length) return setError("접근 가능한 역 ID를 하나 이상 입력해 주세요.");
    try {
      if (id) await adminApi.updatePlace(id, body);
      else await adminApi.createPlace(body);
      setFeedback(id ? "장소를 수정했습니다." : "장소를 추가했습니다."); form.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "장소를 저장하지 못했습니다."); }
  }

  if (status === "loading") return <main className="centerState"><p>관리자 권한을 확인하는 중…</p></main>;
  if (status === "anonymous") return <main className="centerState"><h1>로그인이 필요합니다</h1><Link href="/login">로그인하기</Link></main>;
  if (user?.role !== "ADMIN") return <main className="centerState"><h1>접근 권한이 없습니다</h1><p>관리자 계정만 사용할 수 있습니다.</p></main>;

  return <main className="adminPage contentShell">
    <header className="adminHero"><div><p className="eyebrow">METROTRIP CONTROL CENTER</p><h1>관리자 페이지</h1><p>서비스 콘텐츠와 추천 장소를 안전하게 관리합니다.</p></div><button className="outlineButton" type="button" onClick={() => void load()}><RefreshCw size={16} /> 새로고침</button></header>
    <nav className="adminTabs" aria-label="관리 메뉴"><button aria-pressed={section === "notices"} onClick={() => setSection("notices")}><BellRing size={17} /> 공지사항</button><button aria-pressed={section === "content"} onClick={() => setSection("content")}><MessageSquareWarning size={17} /> 콘텐츠 관리</button><button aria-pressed={section === "places"} onClick={() => setSection("places")}><MapPin size={17} /> 장소 관리</button></nav>
    {feedback ? <div className="successBanner" role="status">{feedback}</div> : null}{error ? <div className="inlineError"><p>{error}</p><button onClick={() => setError(null)}>닫기</button></div> : null}

    {section === "notices" ? <section className="adminWorkspace"><div className="adminPanel"><h2>{editingNotice ? "공지 수정" : "공지 추가"}</h2><form className="adminForm" key={editingNotice?.noticeId ?? "new"} onSubmit={saveNotice}><label>유형<select name="noticeType" defaultValue={editingNotice?.noticeType ?? "BOARD"}><option value="BOARD">게시판 공지</option><option value="ALARM">알림 공지</option></select></label><label>제목<input name="title" required maxLength={200} defaultValue={editingNotice?.title ?? ""} /></label><label>내용<textarea name="content" required rows={8} defaultValue={editingNotice?.content ?? ""} /></label><div className="rowActions"><button className="primaryButton" type="submit">{editingNotice ? "수정 저장" : "공지 추가"}</button>{editingNotice ? <button type="button" onClick={() => setEditingNotice(null)}>취소</button> : null}</div></form></div><div className="adminPanel"><h2>등록된 공지 <small>{notices.length}</small></h2><div className="adminRows">{notices.map((item) => <article className="adminRow" key={item.noticeId}><div><span className="adminBadge">{item.noticeType === "ALARM" ? "알림" : "게시판"}</span><strong>{item.title}</strong><p>{item.content}</p><small>{new Date(item.updatedAt).toLocaleString("ko-KR")}</small></div><div className="rowActions"><button onClick={() => setEditingNotice(item)}>수정</button><button className="dangerButton" onClick={() => void remove("notice", item.noticeId, item.title)}><Trash2 size={14} /> 삭제</button></div></article>)}</div></div></section> : null}

    {section === "content" ? <section className="adminContentGrid"><div className="adminPanel"><h2>후기 관리 <small>{reviews.length}</small></h2><p className="adminHelp">부적절한 후기를 확인한 후 관리자 권한으로 강제 삭제합니다.</p><div className="adminRows">{reviews.map((item) => <article className="adminRow" key={item.reviewId}><div><strong>{item.title}</strong><p>{item.authorNickname} · {item.startStationName} → {item.endStationName}</p><small>후기 #{item.reviewId} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}</small></div><button className="dangerButton" onClick={() => void remove("review", item.reviewId, item.title)}><Trash2 size={14} /> 강제 삭제</button></article>)}</div></div><div className="adminPanel"><h2>모집글 관리 <small>{posts.length}</small></h2><p className="adminHelp">운영 정책에 맞지 않는 모집글을 관리자 권한으로 삭제합니다.</p><div className="adminRows">{posts.map((item) => <article className="adminRow" key={item.postId}><div><strong>{item.title}</strong><p>{item.author.nickname} · {item.recruitment.recruitStatus}</p><small>모집글 #{item.postId} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}</small></div><button className="dangerButton" onClick={() => void remove("post", item.postId, item.title)}><Trash2 size={14} /> 강제 삭제</button></article>)}</div></div></section> : null}

    {section === "places" ? <section className="adminWorkspace"><div className="adminPanel"><h2>장소 추가·수정</h2><p className="adminHelp">장소 ID를 비우면 추가, 입력하면 해당 장소를 수정합니다.</p><form className="adminForm" onSubmit={savePlace}><label>수정할 장소 ID (추가 시 비움)<input name="placeId" type="number" min="1" /></label><div className="adminFieldGrid"><label>장소명<input name="placeName" required /></label><label>카테고리<select name="category"><option value="FOOD">맛집</option><option value="CAFE">카페</option><option value="CULTURE">문화</option><option value="NATURE">산책</option><option value="SHOPPING">쇼핑</option><option value="STAY">숙박</option></select></label></div><label>주소<input name="address" required /></label><div className="adminFieldGrid"><label>위도<input name="latitude" type="number" step="any" required /></label><label>경도<input name="longitude" type="number" step="any" required /></label></div><label>접근 역 ID (쉼표 구분)<input name="stationIds" required placeholder="1, 2" /></label><label>전화번호<input name="phone" /></label><label>설명<textarea name="description" rows={4} /></label><label>이미지 URL (한 줄에 하나)<textarea name="imageUrls" rows={3} /></label><button className="primaryButton" type="submit">장소 저장</button></form></div><div className="adminPanel adminDangerPanel"><h2>장소 삭제</h2><p>현재 백엔드에는 관리자용 전체 장소 목록 API가 없습니다. 공개 화면에서 확인한 장소 ID로 삭제할 수 있습니다.</p><form className="adminInlineDelete" onSubmit={(event) => { event.preventDefault(); const id = Number(new FormData(event.currentTarget).get("deletePlaceId")); if (id) void remove("place", id, `장소 #${id}`); }}><input name="deletePlaceId" type="number" min="1" required placeholder="장소 ID" /><button className="dangerButton" type="submit"><Trash2 size={15} /> 장소 삭제</button></form></div></section> : null}
  </main>;
}
