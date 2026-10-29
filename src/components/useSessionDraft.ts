import { useEffect, useRef, useState } from 'react';
import { readSessionDraft, removeSessionDraft, writeSessionDraft } from '../lib/sessionDraft';

/** Preserve a recovery copy per account and tab; a newer source must still be checked by the editor. */
export function useSessionDraft<T>(
  key: string | null, base: T, draft: T, dirty: boolean, enabled: boolean,
  isValue: (value: unknown) => value is T,
) {
  const [entry, setEntry] = useState(() => ({ key, value: readSessionDraft(key, isValue) }));
  const [storage, setStorage] = useState<'idle' | 'saved' | 'failed'>('idle');
  const wrote = useRef(false);
  const sameKey = entry.key === key;
  const pending = !sameKey || entry.value.kind === 'recovery' || entry.value.kind === 'invalid';

  useEffect(() => {
    if (entry.key === key) return;
    wrote.current = false;
    setStorage('idle');
    setEntry({ key, value: readSessionDraft(key, isValue) });
  }, [entry.key, key, isValue]);

  useEffect(() => {
    if (!enabled || !key || pending) return;
    // A denied initial read can hide an older copy; do not overwrite it later.
    if (entry.value.kind === 'unavailable') { setStorage(dirty ? 'failed' : 'idle'); return; }
    if (dirty) {
      const ok = writeSessionDraft(key, base, draft);
      if (ok) wrote.current = true;
      setStorage(ok ? 'saved' : 'failed');
    } else if (wrote.current) {
      const ok = removeSessionDraft(key);
      if (ok) wrote.current = false;
      setStorage(ok ? 'idle' : 'failed');
    }
  }, [key, enabled, pending, dirty, base, draft, entry.value.kind]);

  useEffect(() => {
    if (!pending && (!enabled || !dirty)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [enabled, dirty, pending]);

  const restore = () => {
    if (!sameKey || entry.value.kind !== 'recovery') return null;
    wrote.current = true;
    setEntry({ key, value: { kind: 'empty' } });
    return entry.value.record;
  };
  const discard = () => {
    if (!key) return false;
    const removed = removeSessionDraft(key);
    wrote.current = false;
    setStorage(removed ? 'idle' : 'failed');
    // The user consented to discard. If removal is blocked, allow editing but warn that the old copy can reappear.
    setEntry({ key, value: { kind: 'empty' } });
    return removed;
  };
  return { recovery: sameKey ? entry.value : { kind: 'empty' as const }, pending, storage, restore, discard };
}
