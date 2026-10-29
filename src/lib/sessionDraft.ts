/** A tab-local recovery copy, never a substitute for saving the actual programme. */
export interface SessionDraft<T> {
  version: 1;
  base: T;
  draft: T;
}

type DraftRead<T> =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
  | { kind: 'recovery'; record: SessionDraft<T> };

const NUMBER_TAG = '__meety_non_finite_number_v1__';

function encode(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return { [NUMBER_TAG]: String(value) };
  return value;
}

function decode(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== 1) return value;
  if (object[NUMBER_TAG] === 'NaN') return NaN;
  if (object[NUMBER_TAG] === 'Infinity') return Infinity;
  if (object[NUMBER_TAG] === '-Infinity') return -Infinity;
  return value;
}

export function readSessionDraft<T>(key: string | null, isValue: (value: unknown) => value is T): DraftRead<T> {
  if (!key) return { kind: 'empty' };
  let raw: string | null;
  try { raw = window.sessionStorage.getItem(key); } catch { return { kind: 'unavailable' }; }
  if (raw === null) return { kind: 'empty' };
  try {
    const value: unknown = JSON.parse(raw, decode);
    if (!value || typeof value !== 'object') return { kind: 'invalid' };
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !isValue(record.base) || !isValue(record.draft)) return { kind: 'invalid' };
    return { kind: 'recovery', record: { version: 1, base: record.base, draft: record.draft } };
  } catch {
    // Never overwrite an unreadable recovery copy without an explicit user decision.
    return { kind: 'invalid' };
  }
}

export function writeSessionDraft<T>(key: string, base: T, draft: T): boolean {
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ version: 1, base, draft }, encode));
    return true;
  } catch { return false; }
}

export function removeSessionDraft(key: string): boolean {
  try { window.sessionStorage.removeItem(key); return true; } catch { return false; }
}
