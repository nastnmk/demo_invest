import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { ApiError, setUnauthorizedHandler } from '../api/http';
import {
  fetchCurrentUser,
  loginAccount,
  registerAccount,
  type AuthUser,
  type UserRole
} from '../api/authApi';
import { fetchClassroomMe, joinClassroom as joinClassroomRequest, type ClassroomMeResponse } from '../api/classroomApi';
import { clearClientCaches } from '../api/moex';
import { clearAccessToken, getAccessToken, hydrateTokenFromStorage, setAccessToken } from './token';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  classroomSummary: ClassroomMeResponse | null;
  authView: 'login' | 'register';
  setAuthView: (v: 'login' | 'register') => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole, teacherCode?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  joinClassroomByCode: (teacherCode: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [classroomSummary, setClassroomSummary] = useState<ClassroomMeResponse | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  const clearSession = useCallback(() => {
    clearAccessToken();
    setAccessTokenState(null);
    setUser(null);
    setClassroomSummary(null);
    clearClientCaches();
  }, []);

  const refreshSession = useCallback(async () => {
    const me = await fetchCurrentUser();
    setUser(me);
    try {
      const cm = await fetchClassroomMe();
      setClassroomSummary(cm);
    } catch {
      setClassroomSummary(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession());
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      hydrateTokenFromStorage();
      const t = getAccessToken();
      setAccessTokenState(t);
      if (!t) {
        if (!cancelled) setIsAuthLoading(false);
        return;
      }
      try {
        await refreshSession();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
        } else {
          setUser(null);
          setClassroomSummary(null);
        }
      } finally {
        if (!cancelled) setIsAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginAccount({ email, password });
      setAccessToken(res.access_token);
      setAccessTokenState(res.access_token);
      await refreshSession();
    },
    [refreshSession]
  );

  const register = useCallback(
    async (name: string, email: string, password: string, role: UserRole, teacherCode?: string) => {
      const res = await registerAccount({
        name,
        email,
        password,
        role,
        teacher_code: teacherCode?.trim() || undefined
      });
      setAccessToken(res.access_token);
      setAccessTokenState(res.access_token);
      await refreshSession();
    },
    [refreshSession]
  );

  const joinClassroomByCode = useCallback(
    async (teacherCode: string) => {
      await joinClassroomRequest({ teacher_code: teacherCode.replace(/\s/g, '').toUpperCase() });
      await refreshSession();
    },
    [refreshSession]
  );

  const logout = useCallback(() => {
    clearSession();
    setAuthView('login');
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isAuthLoading,
      classroomSummary,
      authView,
      setAuthView,
      login,
      register,
      refreshSession,
      joinClassroomByCode,
      logout
    }),
    [
      user,
      accessToken,
      isAuthLoading,
      classroomSummary,
      authView,
      login,
      register,
      refreshSession,
      joinClassroomByCode,
      logout
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth: используйте только внутри AuthProvider');
  return ctx;
}
