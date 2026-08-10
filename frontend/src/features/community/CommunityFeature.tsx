import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthPath, getCommunityPath, navigate, type CommunityPage } from '../../app/route';
import { getCurrentUser, type CurrentUser } from '../../shared/auth/api';
import { useIsAuthenticated } from '../../shared/auth/session';
import { Badge } from '../../shared/ui/Badge';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/Icon';
import { Input } from '../../shared/ui/Input';
import { PreviewFrame } from '../../shared/ui/PreviewFrame';
import { LoginRequiredModal } from '../auth/ui/LoginRequiredModal';
import {
  applyToCommunityPost,
  cancelCommunityApplication,
  createCommunityPost,
  decideCommunityParticipant,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityParticipants,
  listCommunityPosts,
  listMyParticipatingCommunityPosts,
  updateCommunityPost,
} from './api/community';
import type { CommunityPost, CommunityPostDetail, CommunityPostInput, Participant, ParticipantStatus, RecruitStatus } from './types';

function defaultRecruitDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

const emptyInput: CommunityPostInput = { title: '', content: '', recruitCapacity: 2, recruitDeadline: defaultRecruitDeadline(), meetingDate: null };

function dateText(value: string | null) {
  if (!value) return '일정 미정';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
}

function statusText(status: RecruitStatus | ParticipantStatus) {
  return ({ RECRUITING: '모집 중', CLOSED: '모집 마감', APPLIED: '신청 대기', ACCEPTED: '참여 확정', REJECTED: '거절됨', CANCELED: '신청 취소' })[status];
}

function StatusBadge({ status }: { status: RecruitStatus | ParticipantStatus }) {
  const active = status === 'RECRUITING' || status === 'ACCEPTED';
  return <Badge className={active ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'}>{statusText(status)}</Badge>;
}

function PostCard({ post }: { post: CommunityPost }) {
  return <button type="button" onClick={() => navigate(getCommunityPath({ kind: 'detail', postId: post.postId }))} className="w-full text-left"><Card className="group flex flex-col gap-sm p-md transition hover:-translate-y-px hover:border-primary/35 hover:shadow-md"><div className="flex items-center justify-between gap-sm"><StatusBadge status={post.recruitment.status} /><span className="text-body-sm text-on-surface-variant">조회 {post.viewCount}</span></div><div><h3 className="line-clamp-2 text-headline-sm font-heading text-on-surface group-hover:text-primary">{post.title}</h3><p className="mt-xs text-body-md text-on-surface-variant">{post.author.nickname} · {dateText(post.createdAt.slice(0, 10))}</p></div><div className="flex flex-wrap items-center gap-sm border-t border-outline-variant/70 pt-sm text-body-md text-on-surface-variant"><span className="flex items-center gap-xs"><Icon name="group" className="text-[18px] text-primary" />{post.recruitment.acceptedCount} / {post.recruitment.capacity}</span><span className="flex items-center gap-xs"><Icon name="event" className="text-[18px]" />마감 {dateText(post.recruitment.deadline)}</span>{post.recruitment.meetingDate && <span className="flex items-center gap-xs"><Icon name="calendar_month" className="text-[18px]" />{dateText(post.recruitment.meetingDate)}</span>}</div></Card></button>;
}

function PostEditor({ initial, submitLabel, onSubmit, submitting }: { initial: CommunityPostInput; submitLabel: string; onSubmit: (input: CommunityPostInput) => Promise<void>; submitting: boolean }) {
  const [input, setInput] = useState(initial);
  const [error, setError] = useState('');
  return <form className="grid gap-md" onSubmit={(event) => { event.preventDefault(); setError(''); if (!input.title.trim() || !input.content.trim() || !input.recruitDeadline) return setError('제목, 내용, 모집 마감일을 모두 입력해 주세요.'); void onSubmit({ ...input, title: input.title.trim(), content: input.content.trim(), meetingDate: input.meetingDate || null }).catch((caught) => setError(caught instanceof Error ? caught.message : '게시글을 저장하지 못했습니다.')); }}><label className="grid gap-xs text-body-md font-semibold">제목<Input value={input.title} onChange={(event) => setInput((current) => ({ ...current, title: event.target.value }))} maxLength={100} placeholder="함께 떠날 여행의 제목을 입력하세요" required /></label><label className="grid gap-xs text-body-md font-semibold">모집 내용<textarea value={input.content} onChange={(event) => setInput((current) => ({ ...current, content: event.target.value }))} className="min-h-48 w-full resize-y rounded-lg border border-outline-variant bg-surface-bright p-md text-body-md text-on-surface outline-none focus:border-primary" placeholder="여행 일정, 만날 장소, 함께하고 싶은 이유를 알려주세요." required /></label><div className="grid gap-md sm:grid-cols-3"><label className="grid gap-xs text-body-md font-semibold">모집 인원<Input type="number" min={1} value={input.recruitCapacity} onChange={(event) => setInput((current) => ({ ...current, recruitCapacity: Math.max(1, Number(event.target.value)) }))} required /></label><label className="grid gap-xs text-body-md font-semibold">모집 마감일<Input type="date" value={input.recruitDeadline} onChange={(event) => setInput((current) => ({ ...current, recruitDeadline: event.target.value }))} required /></label><label className="grid gap-xs text-body-md font-semibold">만나는 날 <span className="font-normal text-on-surface-variant">(선택)</span><Input type="date" value={input.meetingDate ?? ''} onChange={(event) => setInput((current) => ({ ...current, meetingDate: event.target.value || null }))} /></label></div>{error && <p className="text-body-md text-error">{error}</p>}<div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? '저장 중…' : submitLabel}</Button></div></form>;
}

function PostListPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [keywordDraft, setKeywordDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<RecruitStatus | ''>('');
  const [response, setResponse] = useState<{ items: CommunityPost[]; page: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const next = await listCommunityPosts({ keyword: keyword || undefined, status: status || undefined, page, size: 12 });
      setResponse({ items: next.items, page: next.page, totalPages: next.totalPages });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '모집글을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  }, [keyword, status]);

  useEffect(() => { void load(1); }, [load]);

  return <PreviewFrame contentWidth="board" title="여행 모집" description="같은 방향으로 떠날 동행을 찾아보세요."><div className="flex flex-wrap items-end justify-between gap-md"><div><span className="text-label-caps text-primary">METROTRIP COMMUNITY</span><h2 className="mt-xs text-headline-md font-heading">함께 떠나는 여행</h2></div><Button onClick={() => navigate(getCommunityPath({ kind: 'create' }))}><Icon name="edit" className="text-[18px]" />모집글 작성</Button></div>{!isAuthenticated && <p className="text-body-md text-on-surface-variant">목록은 누구나 볼 수 있고, 작성과 참여는 로그인 후 이용할 수 있습니다.</p>}<form className="flex flex-wrap gap-sm rounded-xl border border-outline-variant/80 bg-surface-bright p-sm shadow-card" onSubmit={(event) => { event.preventDefault(); setKeyword(keywordDraft.trim()); }}><div className="flex min-w-[14rem] flex-1 items-center gap-xs"><Icon name="search" className="ml-sm text-[19px] text-on-surface-variant" /><Input className="border-0 shadow-none" value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} placeholder="제목, 작성자로 검색" /></div><select aria-label="모집 상태" value={status} onChange={(event) => setStatus(event.target.value as RecruitStatus | '')} className="h-11 rounded-lg border border-outline-variant bg-surface-bright px-sm text-body-md"><option value="">전체 상태</option><option value="RECRUITING">모집 중</option><option value="CLOSED">모집 마감</option></select><Button type="submit" variant="secondary">검색</Button></form>{error && <Card className="p-md text-error">{error}</Card>}{!error && !loading && response?.items.length === 0 && <Card className="p-lg text-center text-on-surface-variant">조건에 맞는 모집글이 없습니다.</Card>}<div className="grid gap-[var(--review-grid-gap)] sm:grid-cols-2 lg:grid-cols-3">{response?.items.map((post) => <PostCard key={post.postId} post={post} />)}</div>{loading && <p className="py-md text-center text-body-md text-on-surface-variant">모집글을 불러오는 중입니다.</p>}{response && response.totalPages > 1 && <div className="flex justify-center gap-sm"><Button variant="outline" disabled={response.page <= 1 || loading} onClick={() => void load(response.page - 1)}>이전</Button><span className="flex items-center text-body-md text-on-surface-variant">{response.page} / {response.totalPages}</span><Button variant="outline" disabled={response.page >= response.totalPages || loading} onClick={() => void load(response.page + 1)}>다음</Button></div>}</PreviewFrame>;
}

function PostDetailPage({ postId, isAuthenticated, currentUser }: { postId: number; isAuthenticated: boolean; currentUser: CurrentUser | null }) {
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myStatus, setMyStatus] = useState<ParticipantStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const isOwner = post?.author.userId === currentUser?.userId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCommunityPost(postId);
      setPost(next);
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '모집글을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isAuthenticated) return;
    void Promise.all([listMyParticipatingCommunityPosts('APPLIED'), listMyParticipatingCommunityPosts('ACCEPTED')])
      .then(([applied, accepted]) => {
        const found = [...applied.items, ...accepted.items].find((item) => item.postId === postId);
        setMyStatus(found?.participation.status ?? null);
      })
      .catch(() => undefined);
  }, [isAuthenticated, postId]);
  useEffect(() => {
    if (!isOwner) return;
    void listCommunityParticipants(postId).then((response) => setParticipants(response.items)).catch(() => undefined);
  }, [isOwner, postId]);

  const requireLogin = () => navigate(getAuthPath('login'));
  const apply = async () => { if (!isAuthenticated) return requireLogin(); setSubmitting(true); try { const participant = await applyToCommunityPost(postId); setMyStatus(participant.status); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : '참여를 신청하지 못했습니다.'); } finally { setSubmitting(false); } };
  const cancel = async () => { setSubmitting(true); try { await cancelCommunityApplication(postId); setMyStatus(null); } catch (caught) { setError(caught instanceof Error ? caught.message : '참여 신청을 취소하지 못했습니다.'); } finally { setSubmitting(false); } };
  const remove = async () => { setSubmitting(true); try { await deleteCommunityPost(postId); navigate(getCommunityPath({ kind: 'list' })); } catch (caught) { setError(caught instanceof Error ? caught.message : '모집글을 삭제하지 못했습니다.'); } finally { setSubmitting(false); } };
  const decide = async (participant: Participant, status: 'ACCEPTED' | 'REJECTED') => { setSubmitting(true); try { const updated = await decideCommunityParticipant(postId, participant.participantId, status); setParticipants((current) => current.map((item) => item.participantId === updated.participantId ? updated : item)); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : '참여 신청을 처리하지 못했습니다.'); } finally { setSubmitting(false); } };

  if (loading) return <PreviewFrame contentWidth="board" title="여행 모집" description="모집글을 불러오는 중입니다."><Card className="p-lg text-center text-on-surface-variant">불러오는 중…</Card></PreviewFrame>;
  if (!post) return <PreviewFrame contentWidth="board" title="여행 모집" description="모집글을 확인하세요."><Card className="p-lg text-error">{error || '모집글을 찾을 수 없습니다.'}</Card></PreviewFrame>;

  const canApply = post.recruitment.status === 'RECRUITING' && !isOwner;
  return <PreviewFrame contentWidth="board" title="여행 모집" description="여행 동행 모집의 상세 내용입니다."><button type="button" onClick={() => navigate(getCommunityPath({ kind: 'list' }))} className="flex items-center gap-xs text-body-md text-on-surface-variant hover:text-on-surface"><Icon name="arrow_back" className="text-[18px]" />모집글 목록</button>{error && <Card className="p-md text-error">{error}</Card>}<Card className="p-lg"><div className="flex flex-wrap items-start justify-between gap-md"><div className="min-w-0"><StatusBadge status={post.recruitment.status} /><h2 className="mt-sm text-[var(--content-title-size)] font-heading leading-tight text-on-surface">{post.title}</h2><p className="mt-sm text-body-md text-on-surface-variant">{post.author.nickname} · {dateText(post.createdAt.slice(0, 10))} · 조회 {post.viewCount}</p></div>{isOwner && <div className="flex gap-xs"><Button variant="outline" size="sm" onClick={() => navigate(getCommunityPath({ kind: 'edit', postId }))}>수정</Button><Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)} disabled={submitting}>삭제</Button></div>}</div><div className="my-lg grid gap-sm border-y border-outline-variant/70 py-md sm:grid-cols-3"><span className="flex items-center gap-xs text-body-md"><Icon name="group" className="text-primary" />확정 {post.recruitment.acceptedCount} / {post.recruitment.capacity}명</span><span className="flex items-center gap-xs text-body-md"><Icon name="event_busy" className="text-primary" />마감 {dateText(post.recruitment.deadline)}</span><span className="flex items-center gap-xs text-body-md"><Icon name="calendar_month" className="text-primary" />{dateText(post.recruitment.meetingDate)}</span></div><p className="whitespace-pre-wrap text-body-lg leading-8 text-on-surface">{post.content}</p><div className="mt-lg flex flex-wrap justify-end gap-sm">{!isAuthenticated && canApply && <Button onClick={requireLogin}>로그인하고 참여하기</Button>}{isAuthenticated && myStatus && <><StatusBadge status={myStatus} />{(myStatus === 'APPLIED' || myStatus === 'ACCEPTED') && <Button variant="outline" onClick={() => void cancel()} disabled={submitting}>참여 취소</Button>}</>}{isAuthenticated && !myStatus && canApply && <Button onClick={() => void apply()} disabled={submitting}>참여 신청</Button>}</div></Card>{isOwner && <Card className="overflow-hidden"><h3 className="border-b border-outline-variant/70 px-md py-md text-headline-sm font-heading">참여 신청 관리</h3>{participants.length === 0 && <p className="p-md text-body-md text-on-surface-variant">참여 신청자가 없습니다.</p>}{participants.map((participant) => <div key={participant.participantId} className="flex flex-wrap items-center gap-sm border-b border-outline-variant/70 p-md last:border-b-0"><span className="font-semibold">{participant.user?.nickname ?? '알 수 없음'}</span><StatusBadge status={participant.status} />{participant.status === 'APPLIED' && <span className="ml-auto flex gap-xs"><Button size="sm" onClick={() => void decide(participant, 'ACCEPTED')} disabled={submitting}>승인</Button><Button size="sm" variant="outline" onClick={() => void decide(participant, 'REJECTED')} disabled={submitting}>거절</Button></span>}</div>)}</Card>}<Dialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!submitting) setDeleteConfirmOpen(open); }}><DialogContent><DialogHeader><DialogTitle>모집글을 삭제할까요?</DialogTitle><DialogDescription>삭제한 모집글과 참여 신청은 되돌릴 수 없습니다.</DialogDescription></DialogHeader><div className="mt-lg flex justify-end gap-sm"><Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={submitting}>취소</Button><Button variant="destructive" onClick={() => void remove()} disabled={submitting}>{submitting ? '삭제 중…' : '삭제'}</Button></div></DialogContent></Dialog></PreviewFrame>;
}

function PostWritePage({ page }: { page: Extract<CommunityPage, { kind: 'create' | 'edit' }> }) {
  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(page.kind === 'edit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (page.kind !== 'edit') return; void getCommunityPost(page.postId).then(setPost).catch((caught) => setError(caught instanceof Error ? caught.message : '모집글을 불러오지 못했습니다.')).finally(() => setLoading(false)); }, [page]);
  const initial = useMemo<CommunityPostInput>(() => page.kind === 'create' ? emptyInput : post ? { title: post.title, content: post.content, recruitCapacity: post.recruitment.capacity, recruitDeadline: post.recruitment.deadline, meetingDate: post.recruitment.meetingDate } : emptyInput, [page.kind, post]);
  const save = async (input: CommunityPostInput) => { setSubmitting(true); try { const saved = page.kind === 'create' ? await createCommunityPost(input) : await updateCommunityPost(page.postId, input); navigate(getCommunityPath({ kind: 'detail', postId: saved.postId })); } finally { setSubmitting(false); } };
  return <PreviewFrame contentWidth="board" title={page.kind === 'create' ? '모집글 작성' : '모집글 수정'} description="여행 동행에게 필요한 정보를 명확하게 적어주세요."><button type="button" onClick={() => navigate(page.kind === 'create' ? getCommunityPath({ kind: 'list' }) : getCommunityPath({ kind: 'detail', postId: page.postId }))} className="flex items-center gap-xs text-body-md text-on-surface-variant hover:text-on-surface"><Icon name="arrow_back" className="text-[18px]" />돌아가기</button>{loading && <Card className="p-lg text-center text-on-surface-variant">불러오는 중…</Card>}{error && <Card className="p-md text-error">{error}</Card>}{!loading && !error && <Card className="p-lg"><PostEditor initial={initial} submitLabel={page.kind === 'create' ? '모집글 등록' : '수정 저장'} onSubmit={save} submitting={submitting} /></Card>}</PreviewFrame>;
}

export function CommunityFeature({ page }: { page: CommunityPage }) {
  const isAuthenticated = useIsAuthenticated();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  useEffect(() => { if (!isAuthenticated) { setCurrentUser(null); return; } void getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null)); }, [isAuthenticated]);
  if ((page.kind === 'create' || page.kind === 'edit') && !isAuthenticated) return <LoginRequiredModal description="모집글 작성과 수정은 로그인 후 이용할 수 있습니다." onConfirm={() => navigate(getAuthPath('login'))} />;
  if (page.kind === 'list') return <PostListPage isAuthenticated={isAuthenticated} />;
  if (page.kind === 'detail') return <PostDetailPage postId={page.postId} isAuthenticated={isAuthenticated} currentUser={currentUser} />;
  return <PostWritePage page={page} />;
}
