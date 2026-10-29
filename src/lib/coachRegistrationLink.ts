const KEY = 'meety:coach-registration-link';
export const validRegistrationToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/** The fragment is never sent to the server as part of the page URL. */
export function registrationLink(token: string): string {
  const origin = (import.meta.env.VITE_API_BASE || window.location.origin).replace(/\/$/, '');
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname === 'localhost' && import.meta.env.VITE_API_BASE) throw new Error('Invalid public app origin');
  return `${parsed.origin}/invite#${token}`;
}
export function tokenFromState(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const token = (state as { inviteToken?: unknown }).inviteToken;
  return validRegistrationToken(token) ? token : null;
}
export function rememberRegistrationToken(token: string): void {
  try { sessionStorage.setItem(KEY, token); } catch { /* Router state still carries it for this flow. */ }
}
export function storedRegistrationToken(): string | null {
  try { const token = sessionStorage.getItem(KEY); return validRegistrationToken(token) ? token : null; } catch { return null; }
}
export function clearRegistrationToken(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* Nothing to clear. */ }
}
