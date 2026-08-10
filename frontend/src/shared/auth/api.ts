import { apiRequest, ApiRequestError } from '../lib/apiClient';

export type CurrentUser = {
  userId: number;
  email: string;
  name: string;
  nickname: string;
  role: 'USER' | 'ADMIN';
};

export class SessionValidationError extends Error {
  status: number;

  constructor(status: number) {
    super('현재 로그인 상태를 확인하지 못했습니다.');
    this.status = status;
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    return await apiRequest<CurrentUser>('/users/me');
  } catch (error) {
    if (error instanceof ApiRequestError) throw new SessionValidationError(error.status);
    throw error;
  }
}
