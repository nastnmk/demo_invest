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
import { fetchCurrentUser, loginAccount, registerAccount, type AuthUser, type UserRole } from '../api/authApi';
import { clearClientCaches } from '../api/moex';
import { clearAccessToken, getAccessToken, hydrateTokenFromStorage, setAccessToken } from './token';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authView: 'login' | 'register';
  setAuthView: (v: 'login' | 'register') => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');

  const clearSession = useCallback(() => {
    clearAccessToken();
    setAccessTokenState(null);
    setUser(null);
    clearClientCaches();
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
        const me = await fetchCurrentUser();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
        } else {
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginAccount({ email, password });
    setAccessToken(res.access_token);
    setAccessTokenState(res.access_token);
    const me = await fetchCurrentUser();
    setUser(me);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: UserRole) => {
    const res = await registerAccount({ name, email, password, role });
    setAccessToken(res.access_token);
    setAccessTokenState(res.access_token);
    const me = await fetchCurrentUser();
    setUser(me);
  }, []);

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
      authView,
      setAuthView,
      login,
      register,
      logout
    }),
    [user, accessToken, isAuthLoading, authView, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth: используйте только внутри AuthProvider');
  return ctx;
}
