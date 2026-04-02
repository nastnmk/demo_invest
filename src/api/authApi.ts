import { requestJson } from './http';

export type UserRole = 'teacher' | 'student';

/** Пользователь из /auth/me и /auth/register */
export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  /** null, если не ученик или ещё не привязан к учителю */
  teacher_id?: number | null;
  /** Только для учителя — код класса */
  teacher_code?: string | null;
  /** Имя учителя у ученика */
  teacher_name?: string | null;
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
  teacher_code?: string;
}): Promise<AuthResponse> {
  const payload: Record<string, unknown> = {
    name: body.name,
    email: body.email,
    password: body.password,
    role: body.role
  };
  if (body.role === 'student' && body.teacher_code?.trim()) {
    payload.teacher_code = body.teacher_code.trim().toUpperCase();
  }
  return requestJson<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
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
