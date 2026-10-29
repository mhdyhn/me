import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { faNumber, formatDate } from '../lib/format';
import { AI_MODULES_INFO, type StudentBiometricsData } from '../lib/studentAiBiometrics';
import type { ChatMessage } from '../pages/account/Chat';

type HealthRecord = { coachId: number; coachName: string; biometrics: StudentBiometricsData };
type Thread = { coachId: number; coachName: string };
type HealthPage = { records: HealthRecord[]; nextCursor: number | null };
type ThreadPage = { threads: Thread[]; nextCursor: number | null };

/** Only the student can read previous coaches' settings and conversations. */
export function FormerCoachRecords() {
  const [opened, setOpened] = useState(false);
  const [health, setHealth] = useState<HealthRecord[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [healthCursor, setHealthCursor] = useState<number | null>(null);
  const [threadCursor, setThreadCursor] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!opened || loaded) return;
    let active = true;
    setBusy(true); setError('');
    Promise.all([api<HealthPage>('GET', '/me/ai-settings/archive'), api<ThreadPage>('GET', '/me/chat/archive')])
      .then(([h, t]) => {
        if (!active) return;
        setHealth(Array.isArray(h.records) ? h.records : []); setHealthCursor(h.nextCursor ?? null);
        setThreads(Array.isArray(t.threads) ? t.threads : []); setThreadCursor(t.nextCursor ?? null); setLoaded(true);
      })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : 'سوابق مربیان بارگذاری نشد.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [opened, loaded]);

  async function more(kind: 'health' | 'chat') {
    const cursor = kind === 'health' ? healthCursor : threadCursor;
    if (busy || cursor === null) return;
    setBusy(true); setError('');
    try {
      if (kind === 'health') {
        const page = await api<HealthPage>('GET', `/me/ai-settings/archive?cursor=${cursor}`);
        setHealth((current) => [...current, ...page.records]); setHealthCursor(page.nextCursor);
      } else {
        const page = await api<ThreadPage>('GET', `/me/chat/archive?cursor=${cursor}`);
        setThreads((current) => [...current, ...page.threads]); setThreadCursor(page.nextCursor);
      }
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'ادامهٔ سوابق بارگذاری نشد.'); }
    finally { setBusy(false); }
  }

  return <details className="panel-card coach-history" onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary>سوابق مربیان قبلی</summary>
    <p className="account-muted">تنظیمات پایش و گفتگوهای قبلی فقط برای خودت قابل مشاهده‌اند. برنامه‌های تمرینی و غذایی قبلی در صفحه‌های مربوط به خودشان هستند.</p>
    {busy && <p role="status" className="account-muted">در حال بارگذاری…</p>}
    {error && <p role="alert" className="form-error">{error} <button type="button" className="button button--ghost button--small" onClick={() => { setOpened(false); setTimeout(() => setOpened(true), 0); }}>تلاش دوباره</button></p>}
    {loaded && !health.length && !threads.length && <p className="account-muted">سابقه‌ای از مربی قبلی ثبت نشده است.</p>}
    {health.length > 0 && <div className="coach-history__group"><h3>تنظیمات پایش قبلی</h3>
      {health.map(({ coachId, coachName, biometrics }) => <details className="coach-history__item" key={coachId}>
        <summary>مربی {coachName}</summary>
        <dl className="coach-history__data">
          <div><dt>سن ثبت‌شده</dt><dd>{biometrics.age === null ? '—' : faNumber(biometrics.age)}</dd></div>
          <div><dt>ضربان استراحت</dt><dd>{biometrics.restingHr === null ? '—' : faNumber(biometrics.restingHr)}</dd></div>
          <div><dt>ضربان بیشینه</dt><dd>{faNumber(biometrics.maxHr)} ({biometrics.maxHrMethod === 'custom' ? 'ثبت مستقیم' : biometrics.maxHrMethod === 'fox' ? 'فاکس' : 'تاناکا'})</dd></div>
          <div><dt>بخش‌های فعال</dt><dd>{biometrics.enabledModules.map((module) => AI_MODULES_INFO[module]?.title ?? module).join('، ') || 'هیچ‌کدام'}</dd></div>
          <div><dt>محدودیت‌ها</dt><dd>{biometrics.limitations || '—'}</dd></div>
          <div><dt>حرکت‌های منع‌شده</dt><dd>{biometrics.contraindicatedMovements.join('، ') || '—'}</dd></div>
        </dl>
      </details>)}
      {healthCursor !== null && <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void more('health')}>تنظیمات بیشتر</button>}
    </div>}
    {threads.length > 0 && <div className="coach-history__group"><h3>گفتگوهای قبلی</h3>
      {threads.map((thread) => <ArchivedThread key={thread.coachId} thread={thread} />)}
      {threadCursor !== null && <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void more('chat')}>گفتگوهای بیشتر</button>}
    </div>}
  </details>;
}

function ArchivedThread({ thread }: { thread: Thread }) {
  const [opened, setOpened] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!opened || messages) return;
    let active = true;
    setError('');
    api<{ messages: ChatMessage[] }>('GET', `/me/chat/archive/${thread.coachId}`)
      .then((result) => { if (active) setMessages(result.messages); })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : 'گفتگو بارگذاری نشد.'); });
    return () => { active = false; };
  }, [opened, messages, thread.coachId]);
  return <details className="coach-history__item" onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary>مربی {thread.coachName}</summary>
    <p className="account-muted">فقط ۲۰۰ پیام آخر نمایش داده می‌شود؛ ارسال پیام به مربی قبلی فعال نیست.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!messages && !error && <p role="status" className="account-muted">در حال بارگذاری…</p>}
    {messages && <ol className="coach-history__messages">{messages.map((message) => <li key={message.id}>
      <span className="account-muted">{message.senderId === thread.coachId ? thread.coachName : 'تو'} · {formatDate(new Date(message.createdAt), { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      {message.body && <p>{message.body}</p>}
      {message.mediaData && message.mediaType === 'image' && /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(message.mediaData) && <img src={message.mediaData} alt="تصویر گفتگو" loading="lazy" />}
      {message.mediaData && message.mediaType === 'voice' && /^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.+-]+)?;base64,/i.test(message.mediaData) && <audio controls preload="none" src={message.mediaData} />}
      {message.mediaData && message.mediaType === 'video' && /^data:video\/[a-z0-9.+-]+;base64,/i.test(message.mediaData) && <video controls preload="none" playsInline src={message.mediaData} />}
    </li>)}</ol>}
  </details>;
}
