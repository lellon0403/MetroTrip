import { apiRequest, publicApiRequest } from '../../../shared/lib/apiClient';
import type {
  CommunityPost,
  CommunityPostDetail,
  CommunityPostInput,
  CommunityPostListResponse,
  Participant,
  ParticipantStatus,
  ParticipatingPostListResponse,
  ParticipatingPostStatus,
  RecruitStatus,
} from '../types';

function listQuery(params: { keyword?: string; status?: RecruitStatus; page?: number; size?: number }) {
  const query = new URLSearchParams({ page: String(params.page ?? 1), size: String(params.size ?? 12) });
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.status) query.set('recruit_status', params.status);
  return query;
}

export function listCommunityPosts(params: { keyword?: string; status?: RecruitStatus; page?: number; size?: number } = {}) {
  return publicApiRequest<CommunityPostListResponse>(`/posts?${listQuery(params)}`);
}

export function getCommunityPost(postId: number) {
  return publicApiRequest<CommunityPostDetail>(`/posts/${postId}`);
}

export function createCommunityPost(input: CommunityPostInput) {
  return apiRequest<CommunityPostDetail>('/posts', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCommunityPost(postId: number, input: Partial<CommunityPostInput> & { recruitStatus?: RecruitStatus }) {
  return apiRequest<CommunityPostDetail>(`/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function deleteCommunityPost(postId: number) {
  await apiRequest<null>(`/posts/${postId}`, { method: 'DELETE' });
}

export function applyToCommunityPost(postId: number) {
  return apiRequest<Participant>(`/posts/${postId}/participants`, { method: 'POST' });
}

export function cancelCommunityApplication(postId: number) {
  return apiRequest<Participant>(`/posts/${postId}/participants/me`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CANCELED' }),
  });
}

export function listCommunityParticipants(postId: number, status?: ParticipantStatus) {
  const query = status ? `?status=${status}` : '';
  return apiRequest<{ items: Participant[] }>(`/posts/${postId}/participants${query}`);
}

export function decideCommunityParticipant(postId: number, participantId: number, status: 'ACCEPTED' | 'REJECTED') {
  return apiRequest<Participant>(`/posts/${postId}/participants/${participantId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function listMyCommunityPosts(params: { page?: number; size?: number } = {}) {
  const query = new URLSearchParams({ page: String(params.page ?? 1), size: String(params.size ?? 10) });
  return apiRequest<CommunityPostListResponse>(`/users/me/posts?${query}`);
}

export function listMyParticipatingCommunityPosts(status: ParticipatingPostStatus, params: { page?: number; size?: number } = {}) {
  const query = new URLSearchParams({ status, page: String(params.page ?? 1), size: String(params.size ?? 10) });
  return apiRequest<ParticipatingPostListResponse>(`/users/me/participating-posts?${query}`);
}

export type { CommunityPost };
