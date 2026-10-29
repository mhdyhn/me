import { useEffect, useState } from 'react';
import { samePersonalValue } from '../lib/draftGuard';

/** Keep unsaved input when a newer stored value arrives. */
export function useGuardedDraft<T>(source: T, initialDraft?: () => T) {
  const [base, setBase] = useState(source);
  const [draft, setDraft] = useState<T>(() => initialDraft ? initialDraft() : source);
  const dirty = !samePersonalValue(draft, base);
  const changed = !samePersonalValue(source, base);
  const sameAsSource = samePersonalValue(draft, source);
  useEffect(() => {
    if ((!dirty || sameAsSource) && changed) {
      setBase(source);
      setDraft(source);
    }
  }, [source, dirty, changed, sameAsSource]);
  return {
    base, draft, setDraft, dirty,
    conflict: dirty && changed && !sameAsSource,
    discard: () => { setBase(source); setDraft(source); },
    acceptCurrent: () => setBase(source),
    restore: (savedBase: T, savedDraft: T) => { setBase(savedBase); setDraft(savedDraft); },
  };
}
