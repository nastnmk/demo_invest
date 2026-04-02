import { requestJson } from './http';
import type { AuthUser } from './authApi';

export type ClassroomPortfolioSummary = {
  portfolio_id: number;
  title: string;
  total_value: number;
  cash_balance: number;
  currency: string;
  total_return_pct: number;
  sharpe_ratio: number | null;
  /** Сектора по данным бэкенда (если есть) */
  sectors?: string[];
};

export type StudentWithPortfolios = {
  student: AuthUser;
  portfolios: ClassroomPortfolioSummary[];
};

export type ClassroomMeResponse = {
  current_user: AuthUser;
  teacher: AuthUser | null;
  classmates_count: number;
  students_count: number;
};

export type ClassroomStudentsResponse = {
  teacher: AuthUser;
  students: StudentWithPortfolios[];
};

export type ClassroomCompareResponse = {
  teacher: AuthUser;
  current_student_id: number;
  students: StudentWithPortfolios[];
};

export type JoinClassroomResponse = {
  current_user: AuthUser;
  teacher: AuthUser;
  classmates_count: number;
  students_count: number;
};

export async function fetchClassroomMe(): Promise<ClassroomMeResponse> {
  return requestJson<ClassroomMeResponse>('/api/v1/classroom/me');
}

export async function joinClassroom(body: { teacher_code: string }): Promise<JoinClassroomResponse> {
  return requestJson<JoinClassroomResponse>('/api/v1/classroom/join', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function fetchClassroomStudents(): Promise<ClassroomStudentsResponse> {
  return requestJson<ClassroomStudentsResponse>('/api/v1/classroom/students');
}

export async function fetchClassroomCompare(): Promise<ClassroomCompareResponse> {
  return requestJson<ClassroomCompareResponse>('/api/v1/classroom/compare');
}
