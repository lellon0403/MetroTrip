import type { Review } from '../types';

export type ReviewImageAsset = {
  id: string;
  src: string;
  file?: File;
  mediaUrl?: string;
};

export type ReviewFormValues = {
  title: string;
  rating: number;
  content: string;
  tags: string[];
  startStationId: number;
  endStationId: number;
  travelCost: number | null;
  planId: number | null;
  images: ReviewImageAsset[];
  thumbnailId: string | null;
};

export function createEmptyReviewForm(): ReviewFormValues {
  return {
    title: '', rating: 5, content: '<p></p>', tags: [], startStationId: 0,
    endStationId: 0, travelCost: null, planId: null, images: [], thumbnailId: null,
  };
}

export function createReviewFormFromReview(review: Review): ReviewFormValues {
  const existingImages = review.media.map((media) => ({
    id: `media-${media.mediaId}`,
    src: media.mediaUrl,
    mediaUrl: media.mediaUrl,
  }));
  const contentImageSources = Array.from(review.content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi), (match) => match[1]);
  const contentImages = contentImageSources
    .map((src) => existingImages.find((image) => image.src === src))
    .filter((image): image is (typeof existingImages)[number] => Boolean(image));
  const missingImages = existingImages.filter(({ src }) => !contentImageSources.includes(src));
  const appendedImages = missingImages.map(({ src }) => `<p><img src="${src}" /></p>`).join('');

  return {
    title: review.title,
    rating: review.rating,
    content: `${review.content}${appendedImages}`,
    tags: review.tags,
    startStationId: review.startStationId,
    endStationId: review.endStationId,
    travelCost: review.travelCost,
    planId: review.planId,
    images: [...contentImages, ...missingImages],
    thumbnailId: existingImages[0]?.id ?? null,
  };
}
