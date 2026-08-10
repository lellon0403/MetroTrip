import type { ReviewInput } from '../types';
import type { ReviewFormValues } from './types';

/** 폼 상태를 백엔드 후기 요청 형식으로 변환합니다. */
export function toReviewRequest(values: ReviewFormValues): ReviewInput {
  return {
    title: values.title.trim(),
    content: values.content,
    startStationId: values.startStationId,
    endStationId: values.endStationId,
    rating: values.rating,
    travelCost: values.travelCost,
    planId: values.planId,
    tags: values.tags,
    media: [...values.images].sort((left, right) => Number(right.id === values.thumbnailId) - Number(left.id === values.thumbnailId))
      .filter((image) => image.mediaUrl)
      .map((image) => ({ mediaUrl: image.mediaUrl!, mediaType: 'IMAGE' as const })),
  };
}

export function hasPendingImageUpload(values: ReviewFormValues) {
  return values.images.some((image) => image.file && !image.mediaUrl);
}
