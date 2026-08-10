import { asset } from '../../shared/lib/asset';

const DEFAULT_REVIEW_IMAGES = [
  { src: asset('review-default-1.svg'), aspectClass: 'aspect-[4/3]' },
  { src: asset('review-default-2.svg'), aspectClass: 'aspect-square' },
  { src: asset('review-default-3.svg'), aspectClass: 'aspect-[3/4]' },
] as const;

export function getDefaultReviewImage(reviewId: number) {
  return DEFAULT_REVIEW_IMAGES[reviewId % DEFAULT_REVIEW_IMAGES.length];
}
