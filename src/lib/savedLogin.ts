/** Only the username is stored by the app; passwords belong in a browser password manager. */
export const SAVED_CREDENTIALS_KEY = 'meety.saved-credentials';

export interface SavedCredentials {
  username: string;
  remember: boolean;
}

/** Also sanitizes credentials left by older versions, even when the user is already signed in. */
export function getSavedCredentials(): SavedCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Record<string, unknown>).username !== 'string') {
      window.localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      return null;
    }
    const value = parsed as Record<string, unknown>;
    const safe = { username: value.username as string, remember: value.remember !== false };
    // Rewrite only when necessary; the previous object could contain a plain-text password.
    if ('password' in value || Object.keys(value).some((key) => key !== 'username' && key !== 'remember')) {
      window.localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(safe));
    }
    return safe;
  } catch {
    // Invalid JSON or blocked storage must never stop sign-in.
    try { window.localStorage.removeItem(SAVED_CREDENTIALS_KEY); } catch { /* Storage is unavailable. */ }
    return null;
  }
}
