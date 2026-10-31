import { useCallback, useEffect, useState } from 'react';
import { DATABASE_UNAVAILABLE_EVENT, api } from '../lib/api';

interface HealthAnswer {
  ok?: boolean;
  database?: boolean;
  starting?: boolean;
  error?: { message?: string; detail?: string };
}

const HEADLINE = 'پایگاه داده در دسترس نیست';
const EXPLANATION = 'اطلاعات برنامه موقتاً بارگذاری نمی‌شود. لطفاً چند لحظه بعد دوباره تلاش کنید.';

/**
 * A service notice for a database outage. Every role sees it, on every screen, instead of an
 * empty page. The button rechecks the service and reloads the app once the database answers.
 */
export function DatabaseNotice() {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const health = await api<HealthAnswer>('GET', '/health?probe=1');
      if (health.database) {
        setVisible(false);
        setReason(null);
        return true;
      }
      setReason(health.error?.message ?? null);
      setVisible(true);
      return false;
    } catch (error) {
      setReason(error instanceof Error ? error.message : null);
      setVisible(true);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const reloadWhenReady = useCallback(async () => {
    const healthy = await check();
    // The screens filled in with the data that was missing; start them fresh.
    if (healthy) window.location.reload();
  }, [check]);

  // Any request that fails because of the database shows the notice right away.
  useEffect(() => {
    const onUnavailable = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setReason(detail?.message ?? null);
      setVisible(true);
    };
    window.addEventListener(DATABASE_UNAVAILABLE_EVENT, onUnavailable);
    return () => window.removeEventListener(DATABASE_UNAVAILABLE_EVENT, onUnavailable);
  }, []);

  // The check on every load also keeps a free database from falling asleep.
  useEffect(() => {
    void check();
  }, [check]);

  // While the notice is open, the app keeps looking for the database on its own.
  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => { void reloadWhenReady(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [visible, reloadWhenReady]);

  if (!visible) return null;
  return (
    <div className="database-notice" role="alert">
      <div className="database-notice__body">
        <strong>{HEADLINE}</strong>
        <span>{EXPLANATION}</span>
        {reason && <small>{reason}</small>}
      </div>
      <button type="button" className="database-notice__retry" onClick={() => void reloadWhenReady()} disabled={busy}>
        {busy ? 'در حال بررسی…' : 'تلاش دوباره'}
      </button>
    </div>
  );
}
