import { apiRequest } from '../../../shared/lib/apiClient';
import type { CurrentUser } from '../../../shared/auth/api';

export type FavoriteStation = {
  favoriteId: number;
  stationId: number;
  stationName: string;
  createdAt: string;
};

type FavoriteListResponse = { items: FavoriteStation[] };

type ReauthenticationPurpose = 'PROFILE_UPDATE' | 'PASSWORD_CHANGE' | 'WITHDRAWAL';

type ReauthenticationResponse = {
  verificationToken: string;
  expiresIn: number;
  purpose: ReauthenticationPurpose;
};

export function updateMyProfile(input: { name?: string; nickname?: string }, verificationToken: string) {
  return apiRequest<CurrentUser>('/users/me', {
    method: 'PATCH',
    headers: { 'X-Reauthentication-Token': verificationToken },
    body: JSON.stringify(input),
  });
}

export function reauthenticate(password: string, purpose: ReauthenticationPurpose) {
  return apiRequest<ReauthenticationResponse>('/auth/reauthenticate', {
    method: 'POST',
    body: JSON.stringify({ password, purpose }),
  });
}

export function changeMyPassword(input: { newPassword: string; newPasswordConfirm: string }, verificationToken: string) {
  return apiRequest<{ message: string }>('/users/me/password', {
    method: 'PATCH',
    headers: { 'X-Reauthentication-Token': verificationToken },
    body: JSON.stringify(input),
  });
}

export function withdrawMyAccount(verificationToken: string) {
  return apiRequest<{ message: string }>('/users/me', {
    method: 'DELETE',
    headers: { 'X-Reauthentication-Token': verificationToken },
  });
}

export function listFavoriteStations() {
  return apiRequest<FavoriteListResponse>('/users/me/favorites');
}

export function addFavoriteStation(stationId: number) {
  return apiRequest<FavoriteStation>(`/users/me/favorites/${stationId}`, { method: 'POST' });
}

export async function removeFavoriteStation(stationId: number) {
  await apiRequest<null>(`/users/me/favorites/${stationId}`, { method: 'DELETE' });
}
