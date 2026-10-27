/** Compare persisted JSON data without depending on object-property order. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

export const samePersonalValue = (a: unknown, b: unknown): boolean => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

export class DraftChangedError extends Error {
  constructor() {
    super('این اطلاعات هنگام ویرایش در دستگاه یا زبانهٔ دیگری تغییر کرده است. پیش‌نویس تو حفظ شد؛ نسخهٔ تازه را بررسی کن.');
    this.name = 'DraftChangedError';
  }
}

export function requireUnchanged(current: unknown, expected: unknown): void {
  if (!samePersonalValue(current, expected)) throw new DraftChangedError();
}
