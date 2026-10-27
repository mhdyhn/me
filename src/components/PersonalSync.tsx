import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '../context/SessionContext';
import { getPersonalSyncState, startPersonalSync, subscribePersonalSync } from '../lib/personalSync';

export function usePersonalSyncState() {
  return useSyncExternalStore(subscribePersonalSync, getPersonalSyncState, getPersonalSyncState);
}

export function PersonalSync() {
  const { user } = useSession();
  const userId = user && !user.mustChangePassword ? user.id : null;
  useEffect(() => {
    if (userId === null || import.meta.env.MODE === 'test') return;
    return startPersonalSync({ id: userId });
  }, [userId]);
  return null;
}
