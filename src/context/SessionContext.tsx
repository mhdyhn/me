import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, TOKEN_KEY, USER_KEY, UNAUTHORIZED_EVENT, api, clearStoredUser, clearToken, getStoredUser, getToken, setStoredUser, setToken, type PublicUser } from '../lib/api';
import { SCOPE_KEY, clearAccountScope, ensureAccountScope, isOfflineBuild, scopeMatchesAccount } from '../lib/accountScope';
import { db } from '../lib/db';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { loadStoredProgram } from '../lib/programPersistence';
import { setActiveProgram, setAssignedMeta, setAssignedProgram, setAssignedProgramLoadState } from '../lib/programStore';
import { PERSONAL_DATA_APPLIED } from '../lib/personalSyncEvents';

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
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const { user: current } = await api<{ user: PublicUser }>('GET', '/me');
      if (generation !== refreshGeneration.current) return;
      if (current.isActive === false) {
        try {
          window.sessionStorage.setItem('meety:deactivated-message', 'حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.');
        } catch {
          // Ignore
        }
        clearToken();
        clearStoredUser();
        setUser(null);
        setStatus('signed-out');
        return;
      }
      setUser(current);
      setStoredUser(current);
      setStatus('signed-in');
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      // An expired or revoked session is a normal sign-out. A network failure or offline restart
      // keeps the stored session so the user remains signed in.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        if (error.status === 403 && error.message.includes('غیرفعال')) {
          try {
            window.sessionStorage.setItem('meety:deactivated-message', error.message);
          } catch {
            // Ignore
          }
        }
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

  // Independent students use their own editable programme; coached students use the assigned one.
  const userKey = user ? `${user.id}:${user.role}:${user.coachId ?? 'none'}` : null;
  useEffect(() => {
    if (!user) {
      if (isOfflineBuild) void loadStoredProgram();
      return;
    }
    if (ensureAccountScope(user)) return;
    if (user.role === 'student' && user.coachId !== null) {
      setAssignedMeta(null);
      setAssignedProgram([]);
      setAssignedProgramLoadState('loading');
      void loadAssignedProgram();
    } else {
      setAssignedMeta(null);
      setActiveProgram([]);
      setAssignedProgramLoadState('ready');
      void loadStoredProgram();
    }
    // Only the account identity and relationship matter, not the object's identity.
  }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || (user.role === 'student' && user.coachId !== null)) return;
    const refreshProgram = () => { void loadStoredProgram(); };
    window.addEventListener(PERSONAL_DATA_APPLIED, refreshProgram);
    return () => window.removeEventListener(PERSONAL_DATA_APPLIED, refreshProgram);
  }, [userKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any request that comes back 401 ends the session everywhere.
  useEffect(() => {
    const handle = () => {
      refreshGeneration.current++;
      clearToken();
      clearStoredUser();
      setUser(null);
      setStatus('signed-out');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handle);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle);
  }, []);

  // Auth and scope are shared between tabs. Never keep another account's screen open after a switch.
  useEffect(() => {
    if (isOfflineBuild) return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      let switched = event.key === TOKEN_KEY && event.newValue === null;
      if (event.key === SCOPE_KEY && user && event.newValue !== `user-${user.id}`) switched = true;
      if (event.key === USER_KEY && user) {
        try {
          const next = event.newValue ? JSON.parse(event.newValue) as PublicUser : null;
          switched = !next || next.id !== user.id;
          if (next && !switched && (next.coachId !== user.coachId || next.coachAccess !== user.coachAccess)) void refresh();
        } catch { switched = true; }
      }
      if (switched) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?.id, user?.coachId, user?.coachAccess, refresh]);

  // A relationship may also change on another device, which has no shared storage event.
  useEffect(() => {
    if (isOfflineBuild || !user) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    refreshGeneration.current++;
    const result = await api<{ token: string; user: PublicUser }>('POST', '/auth/login', { username, password });
    setToken(result.token);
    setStoredUser(result.user);
    // Prove the session really reached the server before entering the app. Otherwise the first
    // screen would bounce back to sign-in with no explanation.
    let verified: PublicUser;
    try {
      verified = (await api<{ user: PublicUser }>('GET', '/me')).user;
    } catch {
      clearToken();
      clearStoredUser();
      setUser(null);
      setStatus('signed-out');
      throw new ApiError(401, 'ورود انجام شد، اما مرورگر نشست را نگه نداشت. صفحه را دوباره باز کنید و اگر تکرار شد، پیش‌نمایش یا تنظیمات مرورگر را بررسی کنید.');
    }
    refreshGeneration.current++;
    setUser(verified);
    setStoredUser(verified);
    setStatus('signed-in');
    return verified;
  }, []);

  const signOut = useCallback(async () => {
    refreshGeneration.current++;
    try {
      await api('POST', '/auth/logout', {});
    } catch {
      // Signing out locally still works if the server cannot be reached.
    }
    refreshGeneration.current++;
    clearToken();
    clearStoredUser();
    clearAccountScope();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const handleSetUser = useCallback((nextUser: PublicUser) => {
    refreshGeneration.current++;
    setUser(nextUser);
    setStoredUser(nextUser);
  }, []);

  // The database module opens before sign-in; don't render a new account over the previous database.
  const accountReady = !user || isOfflineBuild || import.meta.env.MODE === 'test' ||
    (scopeMatchesAccount(user) && db.name === `meety-personal-user-${user.id}`);
  const visibleStatus: Status = accountReady ? status : 'loading';
  const value = useMemo(
    () => ({ status: visibleStatus, user, signIn, signOut, refresh, setUser: handleSetUser }),
    [visibleStatus, user, signIn, signOut, refresh, handleSetUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
