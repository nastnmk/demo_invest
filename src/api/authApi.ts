import { requestJson } from './http';

export type UserRole = 'teacher' | 'student';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

export async function registerAccount(body: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function loginAccount(body: { email: string; password: string }): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  return requestJson<AuthUser>('/api/v1/auth/me');
}
