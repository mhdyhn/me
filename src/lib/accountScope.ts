/**
 * Personal data (sessions, body weight, nutrition, profile, programme) lives in the browser.
 * Each account gets its own database so accounts sharing one browser never see each other's data.
 *
 * The developer's account (role `admin`) keeps the original database: that is where the personal
 * training history and profile already are. Every other account starts empty.
 */
export const LEGACY_DB_NAME = 'meety-personal-coach';
const SCOPE_KEY = 'meety.account-scope';
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

/** True when the current personal data is the developer's own (or the offline build's). */
export function usesOwnerData(): boolean {
  return isOfflineBuild || readScope() === OWNER_SCOPE;
}

/**
 * Makes sure the page is using this account's database. The database opens when the page loads,
 * so after a change the page reloads once. Returns true when a reload was started.
 */
export function ensureAccountScope(user: { id: number; role: string }): boolean {
  if (isOfflineBuild || import.meta.env.MODE === 'test') return false;
  const wanted = user.role === 'admin' ? OWNER_SCOPE : `user-${user.id}`;
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
