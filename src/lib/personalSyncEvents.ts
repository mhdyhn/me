import { personalDbName } from './accountScope';

export const PERSONAL_DATA_CHANGED = 'meety:personal-data-changed';
export const PERSONAL_DATA_APPLIED = 'meety:personal-data-applied';
// Only an opaque signal is shared between tabs. Never put health data on the event bus.
const SIGNAL_KEY = `${personalDbName()}:change-signal`;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SIGNAL_KEY) return;
    window.dispatchEvent(new Event(PERSONAL_DATA_APPLIED));
    window.dispatchEvent(new Event(PERSONAL_DATA_CHANGED));
  });
}
function signalOtherTabs(): void {
  try { window.localStorage.setItem(SIGNAL_KEY, `${Date.now()}-${Math.random()}`); } catch { /* Local saves work without cross-tab notifications. */ }
}

/** Local writes notify this tab's synchronizer and other tabs using this account. */
export function notifyPersonalDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PERSONAL_DATA_CHANGED));
  signalOtherTabs();
}

/** Reload local views after a remote write, including views open in other tabs. */
export function notifyPersonalDataApplied(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PERSONAL_DATA_APPLIED));
  signalOtherTabs();
}
