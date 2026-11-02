import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { faDigits } from '../lib/format';
import { useModalFocus } from './useModalFocus';

interface AppNotification {
  id: number;
  kind: 'payment' | 'programme' | 'message' | 'system';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

/** The widest the panel may become; on a phone it is limited by the viewport itself. */
const PANEL_MAX_WIDTH = 320;
/** The gap the panel keeps from the edges of the screen. */
const VIEWPORT_MARGIN = 12;
/** The room the floating navigation of the phone keeps at the bottom. */
const MOBILE_NAV_RESERVE = 84;

interface PanelBox {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
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

function isRtl(): boolean {
  const root = document.documentElement;
  const attribute = root.getAttribute('dir');
  if (attribute) return attribute.toLowerCase() === 'rtl';
  return getComputedStyle(root).direction === 'rtl';
}

/**
 * Where the panel sits on the screen.
 *
 * The panel used to hang from the bell with a logical inset, so in the right-to-left
 * layout it grew to the right of the button and left the screen on a phone. The place is
 * measured instead: the panel keeps the edge of the button that reads first, but it is
 * always clamped inside the viewport, and its height never runs past the bottom.
 */
export function panelBoxFor(button: {
  top: number;
  bottom: number;
  left: number;
  right: number;
}): PanelBox {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.max(200, Math.min(PANEL_MAX_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2));
  let left: number;
  if (viewportWidth <= 680) {
    // On a phone there is no room beside the bell, so the panel takes the width of the
    // screen and sits centred under the header. It can never leave the frame.
    left = Math.round((viewportWidth - width) / 2);
  } else {
    // The panel hangs from the edge of the button that reads first: the right edge in
    // Persian, the left edge otherwise. When that edge would push the panel out of the
    // screen, the other edge is used, and only then the panel is pulled back inside.
    const first = isRtl() ? button.right - width : button.left;
    const second = isRtl() ? button.left : button.right - width;
    const fits = (value: number) => value >= VIEWPORT_MARGIN && value + width <= viewportWidth - VIEWPORT_MARGIN;
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - width);
    left = fits(first) ? first : fits(second) ? second : Math.min(Math.max(first, VIEWPORT_MARGIN), maxLeft);
  }
  const top = Math.round(button.bottom + 8);
  const bottomReserve = viewportWidth <= 680 ? MOBILE_NAV_RESERVE : VIEWPORT_MARGIN;
  const available = viewportHeight - top - bottomReserve;
  const maxHeight = Math.max(140, Math.min(Math.round(viewportHeight * 0.6), Math.max(available, 140)));
  return { left: Math.round(left), top, width, maxHeight };
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
  const [box, setBox] = useState<PanelBox | null>(null);
  const [compact, setCompact] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();

  const close = useCallback(() => setOpen(false), []);
  // On a phone the panel covers the page, so it behaves like a real dialog there.
  const dialogRef = useModalFocus(open && compact, close);

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
    let timer = 0;
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void load(), 60_000);
    };
    // A hidden tab does not poll: an open app keeps its list fresh, a closed one lets the
    // hosted database sleep instead of staying awake for every logged-in account.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else {
        window.clearInterval(timer);
      }
    };
    void load();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  // The panel is placed before the browser paints, so it never appears half outside.
  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      const next = panelBoxFor(button.getBoundingClientRect());
      setBox((current) =>
        current && current.left === next.left && current.top === next.top && current.width === next.width && current.maxHeight === next.maxHeight
          ? current
          : next,
      );
      setCompact(window.innerWidth <= 680);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A pointer press closes the panel, on a phone as well as on a desktop.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (dialogRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, dialogRef]);

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

  const panel = open ? (
    <>
      <div className="notification-bell__backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      <div
        className="notification-bell__panel"
        role="dialog"
        aria-modal={compact ? 'true' : undefined}
        aria-label="اعلان‌ها"
        ref={dialogRef}
        tabIndex={-1}
        style={box ? { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, maxHeight: `${box.maxHeight}px` } : { visibility: 'hidden' }}
      >
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
    </>
  ) : null;

  return (
    <div className="notification-bell" ref={boxRef}>
      <button
        type="button"
        ref={buttonRef}
        className="notification-bell__button"
        aria-label={unread ? `${faDigits(unread)} اعلان خوانده‌نشده` : 'اعلان‌ها'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-bell__badge">{unread > 9 ? '۹+' : faDigits(unread)}</span>}
      </button>
      {/* The panel lives next to the body so it can be placed against the screen, not the button. */}
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
