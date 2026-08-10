import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Eye, Heart, MapPin, MoreHorizontal, Share2, Star, WalletCards } from 'lucide-react';
import { getReview, deleteReview } from '../api/reviews';
import type { Review } from '../types';
import { getReviewPath, navigate } from '../../../app/route';
import { Badge } from '../../../shared/ui/Badge';
import { PreviewFrame } from '../../../shared/ui/PreviewFrame';

function getCurrentUserId() {
  const token = window.localStorage.getItem('metrotrip-access-token');
  if (!token) return null;
  try { return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub); } catch { return null; }
}

function imageSources(content: string) {
  return new Set(Array.from(content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi), (match) => match[1]));
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
}

export function ReviewDetail({ reviewId }: { reviewId: number }) {
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getReview(reviewId).then(setReview).catch((caught) => setError(caught instanceof Error ? caught.message : '후기를 불러오지 못했습니다.'));
  }, [reviewId]);

  if (!review) return <PreviewFrame contentWidth="board" title="후기 상세" description="" notice={error || '후기를 불러오는 중입니다.'}><p>{error || '불러오는 중...'}</p></PreviewFrame>;
  const isOwner = getCurrentUserId() === review.userId;
  const embeddedImages = imageSources(review.content);
  const supplementalMedia = review.media.filter((media) => !embeddedImages.has(media.mediaUrl));

  return (
    <div className="h-full overflow-y-auto bg-background">
      <article className="mx-auto flex w-full max-w-[var(--board-content-width)] flex-col gap-[var(--review-detail-gap)] px-[var(--review-detail-gutter)] py-[var(--review-detail-gutter)] sm:py-[calc(var(--review-detail-gutter)*1.5)]">
        <button type="button" className="flex w-fit items-center gap-xs text-body-md text-on-surface-variant transition-colors hover:text-primary" onClick={() => navigate(getReviewPath({ kind: 'list' }))}><ArrowLeft size={17} />후기 목록</button>
        <header className="grid gap-[var(--spacing-md)] border-b border-outline-variant/80 pb-[var(--review-detail-gap)]">
          <div className="grid gap-[var(--spacing-sm)]">
            <h1 className="review-detail-title font-heading font-bold text-on-surface">{review.title}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-[var(--spacing-lg)] gap-y-[var(--spacing-sm)] text-body-md text-on-surface-variant">
            <div className="flex flex-wrap items-center gap-x-sm gap-y-xs text-body-md text-on-surface-variant">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-primary">{review.authorNickname.slice(0, 1)}</span>
              <span className="font-semibold text-on-surface">{review.authorNickname}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-xs"><CalendarDays size={14} />{formatReviewDate(review.createdAt)}</span>
            </div>
            <div className="flex items-center gap-sm"><span className="flex items-center gap-xs"><Eye size={15} />조회 {review.viewCount}</span><button type="button" className="flex items-center gap-xs transition-colors hover:text-primary"><Share2 size={16} />공유</button>{isOwner && <div className="relative"><button type="button" aria-label="더보기" aria-expanded={menuOpen} className="rounded-full p-xs transition-colors hover:bg-surface-container-low hover:text-on-surface" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>{menuOpen && <div className="absolute right-0 top-full z-20 mt-xs w-28 rounded-[var(--radius-md)] border border-outline-variant bg-surface-bright p-xs shadow-card"><button type="button" className="w-full rounded-[var(--radius-sm)] px-sm py-sm text-left text-body-md hover:bg-surface-container-low" onClick={() => navigate(getReviewPath({ kind: 'edit', reviewId }))}>수정</button><button type="button" className="w-full rounded-[var(--radius-sm)] px-sm py-sm text-left text-body-md text-error hover:bg-error-container" onClick={async () => { if (window.confirm('후기를 삭제할까요?')) { await deleteReview(reviewId); navigate(getReviewPath({ kind: 'list' })); } }}>삭제</button></div>}</div>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-[var(--spacing-lg)] gap-y-[var(--spacing-sm)] pt-[var(--spacing-sm)] text-body-md">
            <div className="flex min-w-0 items-center gap-sm text-primary"><MapPin size={18} className="shrink-0" /><span className="truncate text-body-lg font-semibold">{review.startStationName} <span className="mx-xs text-on-surface-variant">→</span> {review.endStationName}</span></div>
            <span className="flex items-center gap-xs font-semibold text-amber-500"><Star size={16} fill="currentColor" />{(review.rating / 2).toFixed(1)}</span>
            {review.travelCost !== null && <span className="flex items-center gap-xs text-on-surface-variant"><WalletCards size={15} />{review.travelCost.toLocaleString()}원</span>}
          </div>
        </header>
        {supplementalMedia.length > 0 && <section className="grid gap-[var(--spacing-sm)]" aria-label="후기 사진"><p className="text-label-caps text-on-surface-variant">여행 사진</p><div className="grid gap-[var(--spacing-sm)] sm:grid-cols-2">{supplementalMedia.map((media, index) => media.mediaType === 'VIDEO' ? <video key={media.mediaId} controls className="w-full rounded-[var(--radius-lg)] bg-surface-container-low" src={media.mediaUrl}>여행 영상 {index + 1}</video> : <img key={media.mediaId} src={media.mediaUrl} alt={`여행 사진 ${index + 1}`} className="w-full rounded-[var(--radius-lg)] border border-outline-variant/70" />)}</div></section>}
        <section className="text-body-lg leading-8 text-on-surface"><div className="review-detail-content max-w-none [&_img]:my-[var(--spacing-lg)] [&_img]:h-auto [&_img]:max-h-[38rem] [&_img]:max-w-full [&_img]:rounded-[var(--radius-lg)] [&_img]:border [&_img]:border-outline-variant/70" dangerouslySetInnerHTML={{ __html: review.content }} /></section>
        {review.tags.length > 0 && <div className="flex flex-wrap gap-xs">{review.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}</div>}
        <footer className="flex justify-center border-t border-outline-variant/80 pt-[var(--spacing-lg)]"><button type="button" className="flex items-center gap-xs rounded-full px-sm py-xs text-body-md text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"><Heart size={17} />좋아요 {review.likeCount ?? 0}</button></footer>
      </article>
    </div>
  );
}
