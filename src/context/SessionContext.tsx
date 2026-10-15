import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, UNAUTHORIZED_EVENT, api, clearStoredUser, clearToken, getStoredUser, getToken, setStoredUser, setToken, type PublicUser } from '../lib/api';
import { clearAccountScope, ensureAccountScope, isOfflineBuild } from '../lib/accountScope';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { loadStoredProgram } from '../lib/programPersistence';

type Status = 'loading' | 'signed-out' | 'signed-in';

interface SessionValue {
  status: Status;
  user: PublicUser | null;
  signIn: (username: string, password: string) => Promise<PublicUser>;
  signOut: () => Promise<void>;
  /** Re-reads the current user, for example after the password was changed. */
  refresh: () => Promise<void>;
  setUser: (user: PublicUser) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Keeps the signed-in account (or none) for the account and coach screens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const initialUser = typeof window !== 'undefined' ? getStoredUser() : null;
  const initialToken = typeof window !== 'undefined' ? getToken() : null;
  const [status, setStatus] = useState<Status>(() => (initialUser && initialToken ? 'signed-in' : 'loading'));
  const [user, setUser] = useState<PublicUser | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api<{ user: PublicUser }>('GET', '/me');
      setUser(current);
      setStoredUser(current);
      setStatus('signed-in');
    } catch (error) {
      // An expired or revoked session is a normal sign-out. A network failure or offline restart
      // keeps the stored session so the user remains signed in.
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        clearStoredUser();
        setUser(null);
        setStatus('signed-out');
      } else {
        if (getToken() && getStoredUser()) {
          setStatus('signed-in');
        } else {
          setStatus('signed-out');
        }
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Each account gets its own local data and programme. A student's programme comes from the coach.
  const userKey = user ? `${user.id}:${user.role}` : null;
  useEffect(() => {
    if (!user) {
      if (isOfflineBuild) void loadStoredProgram();
      return;
    }
    if (ensureAccountScope(user)) return;
    if (user.role === 'student') void loadAssignedProgram();
    else void loadStoredProgram();
    // Only the account identity matters here, not the object's identity.
  }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any request that comes back 401 ends the session everywhere.
  useEffect(() => {
    const handle = () => {
      clearToken();
      clearStoredUser();
      setUser(null);
      setStatus('signed-out');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handle);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api<{ token: string; user: PublicUser }>('POST', '/auth/login', { username, password });
    setToken(result.token);
    setStoredUser(result.user);
    // Prove the session really reached the server before entering the app. Otherwise the first
    // screen would bounce back to sign-in with no explanation.
    try {
      await api<{ user: PublicUser }>('GET', '/me');
    } catch {
      clearToken();
      clearStoredUser();
      setUser(null);
      setStatus('signed-out');
      throw new ApiError(401, 'ورود انجام شد، اما مرورگر نشست را نگه نداشت. صفحه را دوباره باز کنید و اگر تکرار شد، پیش‌نمایش یا تنظیمات مرورگر را بررسی کنید.');
    }
    setUser(result.user);
    setStatus('signed-in');
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('POST', '/auth/logout', {});
    } catch {
      // Signing out locally still works if the server cannot be reached.
    }
    clearToken();
    clearStoredUser();
    clearAccountScope();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const handleSetUser = useCallback((nextUser: PublicUser) => {
    setUser(nextUser);
    setStoredUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, refresh, setUser: handleSetUser }),
    [status, user, signIn, signOut, refresh, handleSetUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
