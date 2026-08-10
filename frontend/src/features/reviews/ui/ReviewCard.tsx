import { Eye, Heart, MapPin, Star } from 'lucide-react';
import type { Review } from '../types';
import { getDefaultReviewImage } from '../defaultImages';
import { Badge } from '../../../shared/ui/Badge';
import { navigate, getReviewPath } from '../../../app/route';

function stripHtml(content: string) {
  return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function reviewImage(review: Review) {
  return review.media[0]?.mediaUrl ?? getDefaultReviewImage(review.reviewId).src;
}

function reviewImageClass(review: Review) {
  return review.media[0] ? '' : getDefaultReviewImage(review.reviewId).aspectClass;
}

export function ReviewCard({ review }: { review: Review }) {
  const visibleTags = review.tags.slice(0, 3);
  const hiddenTagCount = review.tags.length - visibleTags.length;

  return (
    <article className="group mb-[var(--review-grid-gap)] break-inside-avoid overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant/80 bg-surface-bright shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <button type="button" className="block w-full text-left focus-visible:outline-offset-[-3px]" onClick={() => navigate(getReviewPath({ kind: 'detail', reviewId: review.reviewId }))}>
        <div className={`relative overflow-hidden bg-surface-container-low ${reviewImageClass(review)}`}>
          <img src={reviewImage(review)} alt="후기 대표 이미지" className={review.media[0] ? 'h-auto w-full transition duration-500 group-hover:scale-[1.015]' : 'h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]'} />
        </div>
        <div className="grid gap-[var(--spacing-sm)] p-[var(--review-card-padding)]">
          <h3 className="line-clamp-2 text-headline-sm font-bold leading-snug text-on-surface">{review.title}</h3>
          <p className="line-clamp-2 text-body-md leading-5 text-on-surface-variant">{stripHtml(review.content)}</p>
          <div className="flex items-center justify-between gap-sm text-[11px] leading-4 text-on-surface-variant">
            <span>{review.authorNickname} · {new Date(review.createdAt).toLocaleDateString('ko-KR')}</span>
            <span className="flex shrink-0 items-center gap-sm"><span className="flex items-center gap-xs"><Eye size={14} />{review.viewCount}</span><span className="flex items-center gap-xs"><Heart size={14} />{review.likeCount ?? 0}</span></span>
          </div>
          <div className="flex items-center justify-between gap-sm border-t border-outline-variant/60 pt-[var(--spacing-sm)] text-body-md">
            <span className="flex min-w-0 items-center gap-xs font-medium text-primary"><MapPin size={15} className="shrink-0" /><span className="truncate">{review.startStationName} → {review.endStationName}</span></span>
            <span className="flex shrink-0 items-center gap-xs font-semibold text-amber-500"><Star size={15} fill="currentColor" />{(review.rating / 2).toFixed(1)}</span>
          </div>
          {visibleTags.length > 0 && <div className="flex min-w-0 flex-nowrap items-center gap-xs overflow-hidden"><div className="flex min-w-0 flex-1 flex-nowrap gap-xs overflow-hidden">{visibleTags.map((tag) => <Badge key={tag} className="shrink-0">#{tag}</Badge>)}</div>{hiddenTagCount > 0 && <Badge className="shrink-0">+{hiddenTagCount}</Badge>}</div>}
        </div>
      </button>
    </article>
  );
}
