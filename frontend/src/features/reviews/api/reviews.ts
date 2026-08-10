import type { Review, ReviewInput, ReviewListResponse } from '../types';
import { apiRequest } from '../../../shared/lib/apiClient';

export function listReviews(params: { keyword?: string; stationId?: number; tag?: string; page?: number; size?: number } = {}) {
  const query = new URLSearchParams();
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.stationId) query.set('station_id', String(params.stationId));
  if (params.tag) query.set('tag', params.tag);
  query.set('page', String(params.page ?? 1));
  query.set('size', String(params.size ?? 20));
  return apiRequest<ReviewListResponse>(`/reviews?${query}`);
}

export function listMyReviews(params: { page?: number; size?: number } = {}) {
  const query = new URLSearchParams({ page: String(params.page ?? 1), size: String(params.size ?? 20) });
  return apiRequest<ReviewListResponse>(`/users/me/reviews?${query}`);
}

export function getReview(reviewId: number) {
  return apiRequest<Review>(`/reviews/${reviewId}`);
}

export function createReview(input: ReviewInput) {
  return apiRequest<Review>('/reviews', { method: 'POST', body: JSON.stringify(input) });
}

export function updateReview(reviewId: number, input: Partial<ReviewInput>) {
  return apiRequest<Review>(`/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function deleteReview(reviewId: number) {
  await apiRequest<null>(`/reviews/${reviewId}`, { method: 'DELETE' });
}
