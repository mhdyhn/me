import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { faDigits } from '../lib/format';

interface AppNotification {
  id: number;
  kind: 'payment' | 'programme' | 'message' | 'system';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${minutes} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} روز پیش`;
  return date.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The bell in the header: the in-app notifications of the club.
 *
 * The list is refreshed every minute so a new message shows up without a reload.
 */
export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const result = await api<{ notifications: AppNotification[]; unread: number }>('GET', '/notifications?limit=15');
      setItems(result.notifications ?? []);
      setUnread(result.unread ?? 0);
    } catch {
      // A failing poll must never break the app; the bell simply keeps the last list.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.readAt) {
      try {
        await api('POST', '/notifications/read', { ids: [item.id] });
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)));
        setUnread((count) => Math.max(0, count - 1));
      } catch {
        // Reading is best effort; the link still opens.
      }
    }
    if (item.link) navigate(item.link);
  }

  async function markAll() {
    setBusy(true);
    try {
      await api('POST', '/notifications/read', {});
      await load();
    } catch {
      // Best effort.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notification-bell" ref={boxRef}>
      <button
        type="button"
        className="notification-bell__button"
        aria-label={unread ? `${faDigits(unread)} اعلان خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-bell__badge">{unread > 9 ? '۹+' : faDigits(unread)}</span>}
      </button>
      {open && (
        <div className="notification-bell__panel" role="dialog" aria-label="اعلان‌ها">
          <header>
            <strong>اعلان‌ها</strong>
            {unread > 0 && (
              <button type="button" onClick={() => void markAll()} disabled={busy}>
                {busy ? <Loader2 size={13} className="spin" /> : <CheckCheck size={13} />} همه خوانده شد
              </button>
            )}
          </header>
          <div className="notification-bell__list">
            {items.length === 0 && <p className="account-muted">هنوز اعلانی ندارید.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-bell__item${item.readAt ? '' : ' is-unread'}`}
                onClick={() => void openItem(item)}
              >
                <span className="notification-bell__dot" aria-hidden="true" />
                <span className="notification-bell__text">
                  <strong>{item.title}</strong>
                  {item.body && <small>{item.body}</small>}
                  <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
