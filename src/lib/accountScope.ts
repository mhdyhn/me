/**
 * Personal data (sessions, body weight, nutrition, profile, programme) lives in the browser.
 * Scopes avoid automatically showing another account's records; they are not a security boundary.
 * Each signed-in account uses its own scope. Legacy data is not imported automatically.
 */
export const LEGACY_DB_NAME = 'meety-personal-coach';
export const SCOPE_KEY = 'meety.account-scope';
const OWNER_SCOPE = 'owner';

export const isOfflineBuild = import.meta.env.MODE === 'offline';

function readScope(): string | null {
  try {
    return window.localStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}

/** The database name for the current scope. Called once, when the database module loads. */
export function personalDbName(): string {
  if (isOfflineBuild) return LEGACY_DB_NAME;
  const scope = readScope();
  if (!scope) return 'meety-personal-signedout';
  return scope === OWNER_SCOPE ? LEGACY_DB_NAME : `meety-personal-${scope}`;
}

/** Use the same account boundary for personal localStorage records as for IndexedDB. */
export function personalStorageKey(key: string): string {
  return `${personalDbName()}:${key}`;
}

/** True when the current personal data is the developer's own (or the offline build's). */
export function usesOwnerData(): boolean {
  // Packaged owner defaults belong only to the legacy/offline scope; never assign them to every admin.
  return isOfflineBuild || readScope() === OWNER_SCOPE;
}

/** Never send records from the previous account's open database during the scope reload. */
export function scopeMatchesAccount(user: { id: number }): boolean {
  return !isOfflineBuild && readScope() === `user-${user.id}`;
}

/**
 * Makes sure the page is using this account's database. The database opens when the page loads,
 * so after a change the page reloads once. Returns true when a reload was started.
 */
export function ensureAccountScope(user: { id: number; role: string }): boolean {
  if (isOfflineBuild || import.meta.env.MODE === 'test') return false;
  const wanted = `user-${user.id}`;
  if (readScope() === wanted) return false;
  try {
    window.localStorage.setItem(SCOPE_KEY, wanted);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Called on sign-out: the next sign-in switches the database again. */
export function clearAccountScope(): void {
  try {
    window.localStorage.removeItem(SCOPE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
