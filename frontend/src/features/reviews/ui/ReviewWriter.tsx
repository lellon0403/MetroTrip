import { useEffect, useState } from 'react';
import { getReview, createReview, updateReview } from '../api/reviews';
import type { Review } from '../types';
import { getReviewPath, navigate } from '../../../app/route';
import { Card } from '../../../shared/ui/Card';
import { PreviewFrame } from '../../../shared/ui/PreviewFrame';
import { ReviewForm } from './ReviewForm';
import { createEmptyReviewForm, createReviewFormFromReview } from '../form/types';
import { toReviewRequest } from '../form/transform';

function submitReview(reviewId: number | undefined, values: Parameters<typeof toReviewRequest>[0]) {
  const request = toReviewRequest(values);
  return reviewId === undefined ? createReview(request) : updateReview(reviewId, request);
}

export function ReviewWriter({ title, description, initialValues, review }: { title: string; description: string; initialValues: Parameters<typeof ReviewForm>[0]['initialValues']; review?: Review }) {
  return <PreviewFrame contentWidth="board" title={title} description={description}><Card className="w-full p-[var(--spacing-md)] shadow-sm sm:p-[var(--spacing-lg)]"><ReviewForm initialValues={initialValues} review={review} onSubmitRequest={submitReview} onSaved={(saved) => navigate(getReviewPath({ kind: 'detail', reviewId: saved.reviewId }))} /></Card></PreviewFrame>;
}

export function ReviewEditor({ reviewId }: { reviewId: number }) {
  const [review, setReview] = useState<Review | null>(null);
  useEffect(() => { getReview(reviewId).then(setReview); }, [reviewId]);
  if (!review) return <PreviewFrame contentWidth="board" title="후기 수정" description="" notice="후기를 불러오는 중입니다."><p>불러오는 중...</p></PreviewFrame>;
  return <ReviewWriter title="후기 수정" description="작성한 후기를 수정합니다." initialValues={createReviewFormFromReview(review)} review={review} />;
}

export function NewReviewWriter() {
  return <ReviewWriter title="후기 작성" description="나만의 지하철 여행 경험을 공유하세요." initialValues={createEmptyReviewForm()} />;
}
