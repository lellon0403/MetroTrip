import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { listReviews } from '../api/reviews';
import type { Review } from '../types';
import { getReviewPath, navigate } from '../../../app/route';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Input } from '../../../shared/ui/Input';
import { PreviewFrame } from '../../../shared/ui/PreviewFrame';
import { Icon } from '../../../shared/ui/Icon';
import { ReviewCard } from './ReviewCard';

export function ReviewList() {
  const [keywordDraft, setKeywordDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [tag, setTag] = useState('');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const fetchPage = useCallback(async (page: number, replace: boolean) => {
    if (loadingRef.current || (!replace && !hasMoreRef.current)) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await listReviews({ keyword: keyword || undefined, tag: tag || undefined, page, size: 12 });
      setReviews((current) => replace ? response.items : [...current, ...response.items]);
      setNextPage(response.page + 1);
      setHasMore(response.page < response.totalPages);
      hasMoreRef.current = response.page < response.totalPages;
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '후기를 불러오지 못했습니다.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [keyword, tag]);

  useEffect(() => {
    setReviews([]); setNextPage(1); setHasMore(true); hasMoreRef.current = true;
    void fetchPage(1, true);
  }, [fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void fetchPage(nextPage, false); }, { rootMargin: '480px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, nextPage]);

  return (
    <PreviewFrame contentWidth="board" title="후기 게시판" description="다른 여행자들의 경험을 확인하고, 당신의 여행을 공유해보세요.">
      <div className="flex flex-wrap items-end justify-between gap-[var(--review-grid-gap)]">
        <div className="grid gap-xs"><span className="text-label-caps text-primary">METROTRIP REVIEWS</span><h2 className="text-headline-md font-heading text-on-surface">여행의 순간을 모아봤어요</h2><p className="text-body-md text-on-surface-variant">지하철을 타고 만난 장소와 기억을 기록해보세요.</p></div>
        <Button onClick={() => navigate(getReviewPath({ kind: 'create' }))}>후기 작성하기</Button>
      </div>
      <form className="flex flex-wrap items-center gap-sm rounded-[var(--radius-lg)] border border-outline-variant/80 bg-surface-bright p-[var(--spacing-sm)] shadow-card transition-shadow focus-within:border-primary/55 focus-within:shadow-sm" onSubmit={(event) => { event.preventDefault(); setKeyword(keywordDraft.trim()); setTag(tagDraft.trim().replace(/^#/, '')); }}>
        <div className="flex min-w-[14rem] flex-1 items-center gap-xs"><Search className="ml-sm shrink-0 text-on-surface-variant" size={18} /><Input className="border-0 shadow-none" value={keywordDraft} onChange={(event) => setKeywordDraft(event.target.value)} placeholder="여행지, 제목, 키워드로 검색" /></div>
        <div className="flex min-w-[10rem] flex-1 items-center gap-xs border-l border-outline-variant/70 pl-sm sm:max-w-[15rem]"><span className="text-body-md text-primary">#</span><Input className="border-0 shadow-none" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="태그로 필터" /></div>
        <Button type="submit" variant="secondary">검색</Button>
      </form>
      {tag && <div className="flex items-center gap-xs text-body-md text-on-surface-variant"><span>태그 필터</span><button type="button" onClick={() => { setTag(''); setTagDraft(''); }} className="inline-flex items-center gap-[2px] rounded-full bg-primary-container px-sm py-xs text-on-primary-container hover:bg-primary-container/70">#{tag}<Icon name="close" className="text-[15px]" /></button></div>}
      {error && <Card className="p-md text-error">{error}</Card>}
      {!error && !loading && reviews.length === 0 && <Card className="p-lg text-center text-on-surface-variant">등록된 후기가 없습니다.</Card>}
      <div className="columns-1 gap-[var(--review-grid-gap)] sm:columns-2 lg:columns-3">{reviews.map((review) => <ReviewCard key={review.reviewId} review={review} />)}</div>
      <div ref={sentinelRef} className="flex min-h-12 items-center justify-center text-body-md text-on-surface-variant">{loading && '후기를 불러오는 중입니다.'}{!loading && !hasMore && reviews.length > 0 && '모든 후기를 확인했습니다.'}</div>
    </PreviewFrame>
  );
}
