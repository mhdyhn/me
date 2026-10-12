import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { PanelPage, RequireRole } from './AccountShell';

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
      <PanelPage title="گفتگو با مربی">
        <ChatThread path="/me/chat" />
      </PanelPage>
    </RequireRole>
  );
}

/** A coach's thread with one of their students. */
export function CoachChat() {
  const { studentId } = useParams();
  return (
    <RequireRole roles={['coach']}>
      <PanelPage title="گفتگو با شاگرد">
        <Link className="button button--ghost chat-back" to="/coach">
          <ArrowLeft size={16} /> فهرست شاگردها
        </Link>
        <ChatThread path={`/students/${studentId}/chat`} />
      </PanelPage>
    </RequireRole>
  );
}

/** Shows the thread, refreshes it every few seconds, and sends new messages. The server decides who may read it. */
function ChatThread({ path }: { path: string }) {
  const { user } = useSession();
  const [data, setData] = useState<ChatResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setData(await api<ChatResponse>('GET', path));
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'گفتگو بارگذاری نشد.');
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSendError(null);
    setBusy(true);
    try {
      await api<{ message: ChatMessage }>('POST', path, { body: text });
      setDraft('');
      await load();
    } catch (caught) {
      setSendError(caught instanceof ApiError ? caught.message : 'پیام ارسال نشد.');
    } finally {
      setBusy(false);
    }
  }

  const partner = data?.coachName ?? data?.studentName ?? null;

  return (
    <section className="chat" aria-label="گفتگو">
      {partner && <p className="chat-partner">گفتگو با <strong>{partner}</strong></p>}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {data === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {data && data.messages.length === 0 && <p className="account-muted">هنوز پیامی نیست. اولین پیام را بفرستید.</p>}

      {data && data.messages.length > 0 && (
        <ol className="chat-log">
          {data.messages.map((message) => {
            const mine = message.senderId === user?.id;
            return (
              <li key={message.id} className={`chat-bubble${mine ? ' chat-bubble--mine' : ''}`}>
                <p>{message.body}</p>
                <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={bottomRef} />

      <form className="chat-form" onSubmit={(event) => void send(event)}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MESSAGE_MAX}
          rows={2}
          placeholder="پیامتان را بنویسید…"
          aria-label="متن پیام"
        />
        <button type="submit" className="button button--primary" disabled={busy || draft.trim().length === 0}>
          <Send size={16} /> ارسال
        </button>
        {sendError && <p className="form-error" role="alert">{sendError}</p>}
      </form>
    </section>
  );
}
