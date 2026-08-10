import type { AuthTokens, RegisteredUser } from '../types';
import { apiRequest, publicApiRequest } from '../../../shared/lib/apiClient';

export function requestEmailVerification(email: string) {
  return publicApiRequest<{ message: string }>('/auth/email-verifications', {
    method: 'POST',
    body: JSON.stringify({ email, purpose: 'SIGNUP' }),
  });
}

export function confirmEmailVerification(email: string, code: string) {
  return publicApiRequest<{ verificationToken: string }>('/auth/email-verifications/confirm', {
    method: 'POST',
    body: JSON.stringify({ email, code, purpose: 'SIGNUP' }),
  });
}

export function registerAccount(input: {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  nickname: string;
  termsAgreed: boolean;
  privacyAgreed: boolean;
  emailVerificationToken: string;
}) {
  return publicApiRequest<RegisteredUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginAccount(email: string, password: string) {
  return publicApiRequest<AuthTokens>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutAccount() {
  return apiRequest<{ message: string }>('/auth/logout', { method: 'POST' });
}

export function requestPasswordReset(email: string) {
  return publicApiRequest<{ message: string }>('/auth/password-reset/requests', {
    method: 'POST',
    body: JSON.stringify({ email, purpose: 'PASSWORD_RESET' }),
  });
}

export function resetPassword(input: {
  email: string;
  code: string;
  newPassword: string;
  newPasswordConfirm: string;
}) {
  return publicApiRequest<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ ...input, purpose: 'PASSWORD_RESET' }),
  });
}
