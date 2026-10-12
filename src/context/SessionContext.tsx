import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, clearToken, getToken, setToken, type PublicUser } from '../lib/api';

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
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'signed-out'));
  const [user, setUser] = useState<PublicUser | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('signed-out');
      return;
    }
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

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api<{ token: string; user: PublicUser }>('POST', '/auth/login', { username, password });
    setToken(result.token);
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
