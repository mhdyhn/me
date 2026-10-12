import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, MessageCircle } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { RequireRole } from './AccountShell';

const MESSAGE_MAX = 1000;
const REFRESH_MS = 5000;

interface ChatMessage {
  id: number;
  senderId: number;
  body: string;
  createdAt: string;
}

interface ChatResponse {
  coachName?: string | null;
  studentName?: string;
  messages: ChatMessage[];
}

/** A student's thread with their coach. */
export function StudentChat() {
  return (
    <RequireRole roles={['student']}>
      <ChatThread path="/me/chat" />
    </RequireRole>
  );
}

/** A coach's thread with one of their students. */
export function CoachChat() {
  const { studentId } = useParams();
  return (
    <RequireRole roles={['coach']}>
      <div className="chat-page">
        <Link className="chat-back" to="/coach">
          <ArrowLeft size={16} /> همهٔ شاگردها
        </Link>
        <ChatThread path={`/students/${studentId}/chat`} />
      </div>
    </RequireRole>
  );
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (dayKey(iso) === dayKey(today.toISOString())) return 'امروز';
  return date.toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The conversation screen. The thread fills the screen height, the newest message stays in view,
 * and the composer sits at the bottom. The server decides who may read or write the thread.
 */
function ChatThread({ path }: { path: string }) {
  const { user } = useSession();
  const [data, setData] = useState<ChatResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  async function load() {
    try {
      setData(await api<ChatResponse>('GET', path));
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'گفتگو بارگذاری نشد.');
    }
  }

  useEffect(() => {
    stickToBottom.current = true;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Scroll inside the thread only (not the page), and only while the reader is already at the newest message.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [data?.messages.length]);

  function onScroll() {
    const log = logRef.current;
    if (!log) return;
    stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setSendError(null);
    setBusy(true);
    stickToBottom.current = true;
    try {
      await api<{ message: ChatMessage }>('POST', path, { body: text });
      setDraft('');
      await load();
    } catch (caught) {
      setSendError(caught instanceof ApiError ? caught.message : 'پیام ارسال نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  // Enter sends, Shift+Enter starts a new line. Enter that confirms an IME composition does not send.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const partner = data?.coachName ?? data?.studentName ?? null;
  const messages = data?.messages ?? [];

  return (
    <section className="chat-screen" aria-label="گفتگو">
      <header className="chat-header">
        <span className="chat-avatar" aria-hidden="true">{partner ? partner.trim().charAt(0) : <MessageCircle size={18} />}</span>
        <div>
          <strong>{partner ?? 'گفتگو'}</strong>
          <span>{user?.role === 'coach' ? 'شاگرد' : 'مربی'}</span>
        </div>
      </header>

      <div className="chat-log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite">
        {loadError && <p className="chat-notice chat-notice--error" role="alert">{loadError}</p>}
        {data === null && !loadError && <p className="chat-notice">در حال بارگذاری…</p>}
        {data && messages.length === 0 && (
          <div className="chat-empty">
            <MessageCircle size={28} />
            <p>هنوز پیامی نیست.</p>
            <span>اولین پیام را بنویسید.</span>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.senderId === user?.id;
          const previous = messages[index - 1];
          const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          return (
            <div key={message.id}>
              {newDay && <div className="chat-day"><span>{dayLabel(message.createdAt)}</span></div>}
              <div className={`chat-row${mine ? ' chat-row--mine' : ''}`}>
                <div className="chat-bubble">
                  <p>{message.body}</p>
                  <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sendError && <p className="chat-notice chat-notice--error" role="alert">{sendError}</p>}
      <form className="chat-composer" onSubmit={onSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MESSAGE_MAX}
          rows={1}
          placeholder="پیام بنویسید…"
          aria-label="متن پیام"
        />
        <button type="submit" className="chat-send" disabled={busy || draft.trim().length === 0} aria-label="ارسال پیام">
          <ArrowUp size={20} strokeWidth={2.4} />
        </button>
      </form>
    </section>
  );
}
