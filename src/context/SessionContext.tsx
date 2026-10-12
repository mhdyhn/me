import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, UNAUTHORIZED_EVENT, api, clearToken, setToken, type PublicUser } from '../lib/api';

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
  // Always ask the server: the session cookie works even when no token is stored in this browser.
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { user: current } = await api<{ user: PublicUser }>('GET', '/me');
      setUser(current);
      setStatus('signed-in');
    } catch (error) {
      // An expired or revoked session is a normal sign-out. A network failure keeps the
      // stored token, so the next visit can try again.
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        setUser(null);
        setStatus('signed-out');
      } else {
        setStatus('signed-out');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any request that comes back 401 ends the session everywhere.
  useEffect(() => {
    const handle = () => {
      clearToken();
      setUser(null);
      setStatus('signed-out');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handle);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api<{ token: string; user: PublicUser }>('POST', '/auth/login', { username, password });
    setToken(result.token);
    // Prove the session really reached the server before entering the app. Otherwise the first
    // screen would bounce back to sign-in with no explanation.
    try {
      await api<{ user: PublicUser }>('GET', '/me');
    } catch {
      clearToken();
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
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, refresh, setUser }),
    [status, user, signIn, signOut, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
