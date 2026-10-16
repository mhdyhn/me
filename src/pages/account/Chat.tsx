import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  CheckCheck,
  Download,
  Image as ImageIcon,
  Maximize2,
  MessageCircle,
  Mic,
  Video as VideoIcon,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { RequireRole } from './AccountShell';

const MESSAGE_MAX = 1000;
const REFRESH_MS = 5000;

export interface ChatMessage {
  id: number;
  senderId: number;
  body: string;
  mediaType?: 'text' | 'image' | 'voice' | 'video' | null;
  mediaData?: string | null;
  createdAt: string;
}

interface ChatResponse {
  coachName?: string | null;
  studentName?: string;
  adminName?: string;
  messages: ChatMessage[];
}

interface ActivePhoto {
  src: string;
  caption?: string;
  sender?: string;
  time?: string;
}

/** A student's thread with their coach. */
export function StudentChat() {
  return (
    <RequireRole roles={['student']}>
      <ChatThread path="/me/chat" backTo="/" defaultRoleTitle="مربی تمرین" />
    </RequireRole>
  );
}

/** A coach's thread with one of their students. */
export function CoachChat() {
  const { studentId } = useParams();
  return (
    <RequireRole roles={['coach']}>
      <ChatThread path={`/students/${studentId}/chat`} backTo="/coach" defaultRoleTitle="شاگرد" />
    </RequireRole>
  );
}

/** A coach's thread with the gym admin. */
export function CoachAdminChat() {
  return (
    <RequireRole roles={['coach']}>
      <ChatThread path="/coach/chat" backTo="/coach" defaultRoleTitle="مدیر باشگاه" />
    </RequireRole>
  );
}

/** An admin's thread with a specific coach. */
export function AdminCoachChat() {
  const { coachId } = useParams();
  return (
    <RequireRole roles={['admin']}>
      <ChatThread path={`/coaches/${coachId}/chat`} backTo="/coach" defaultRoleTitle="مربی" />
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

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Image decode error'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

/** Full-screen photo lightbox viewer like Telegram */
export function ChatPhotoLightbox({
  photo,
  onClose,
}: {
  photo: ActivePhoto;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleDownload() {
    const a = document.createElement('a');
    a.href = photo.src;
    a.download = `meety-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="chat-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="نمایش تصویر در اندازه بزرگ"
      onClick={onClose}
    >
      <header className="chat-lightbox__header" onClick={(e) => e.stopPropagation()}>
        <div className="chat-lightbox__info">
          {photo.sender && <strong>{photo.sender}</strong>}
          {photo.time && <span>{photo.time}</span>}
        </div>
        <div className="chat-lightbox__tools">
          <button
            type="button"
            className="chat-lightbox__btn"
            onClick={() => setZoomed((z) => !z)}
            title={zoomed ? 'اندازه معمولی' : 'بزرگ‌نمایی'}
            aria-label={zoomed ? 'اندازه معمولی' : 'بزرگ‌نمایی'}
          >
            {zoomed ? <ZoomOut size={19} /> : <ZoomIn size={19} />}
          </button>
          <button
            type="button"
            className="chat-lightbox__btn"
            onClick={handleDownload}
            title="دانلود تصویر"
            aria-label="دانلود تصویر"
          >
            <Download size={19} />
          </button>
          <button
            type="button"
            className="chat-lightbox__btn chat-lightbox__btn--close"
            onClick={onClose}
            title="بستن"
            aria-label="بستن"
          >
            <X size={21} />
          </button>
        </div>
      </header>

      <div
        className={`chat-lightbox__stage${zoomed ? ' is-zoomed' : ''}`}
        onClick={onClose}
      >
        <img
          src={photo.src}
          alt={photo.caption || 'تصویر پیام'}
          className="chat-lightbox__img"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          title="برای بزرگ‌نمایی یا کوچک‌کردن کلیک کنید"
        />
      </div>

      {photo.caption && (
        <div className="chat-lightbox__caption" onClick={(e) => e.stopPropagation()}>
          <p>{photo.caption}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The conversation screen. The thread fills the screen height, the newest message stays in view,
 * and the composer sits at the bottom. Supports text, voice notes, photos with full-screen lightbox,
 * and short videos. Styled like Telegram for all 3 user roles.
 */
function ChatThread({
  path,
  backTo = '/',
  defaultRoleTitle,
}: {
  path: string;
  backTo?: string;
  defaultRoleTitle?: string;
}) {
  const { user } = useSession();
  const [data, setData] = useState<ChatResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Active full-screen photo lightbox
  const [activePhoto, setActivePhoto] = useState<ActivePhoto | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Media input refs
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const logRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    const intervalHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    };
    const timer = window.setInterval(intervalHandler, REFRESH_MS);
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

  // Timer effect for voice recording
  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  async function sendPayload(payload: { body: string; mediaType?: string; mediaData?: string }) {
    setSendError(null);
    stickToBottom.current = true;
    try {
      await api<{ message: ChatMessage }>('POST', path, payload);
      setDraft('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      await load();
    } catch (caught) {
      setSendError(caught instanceof ApiError ? caught.message : 'پیام ارسال نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function sendText() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    await sendPayload({ body: text, mediaType: 'text' });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendText();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendText();
    }
  }

  function onTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    // Auto-adjust height up to 128px like Telegram
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  async function startRecording() {
    if (busy) return;
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = '';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecordSeconds(0);
      setIsRecording(true);
    } catch {
      setSendError('دسترسی به میکروفون داده نشد یا مرورگر از ضبط صدا پشتیبانی نمی‌کند.');
    }
  }

  async function stopAndSendRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      return;
    }

    setBusy(true);
    setSendError(null);

    const actualMime = recorder.mimeType || 'audio/webm';
    recorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        if (audioBlob.size < 100) {
          setSendError('صدایی ضبط نشد.');
          setBusy(false);
          setIsRecording(false);
          return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          await sendPayload({
            body: 'پیام صوتی',
            mediaType: 'voice',
            mediaData: dataUrl,
          });
          setIsRecording(false);
        };
        reader.onerror = () => {
          setSendError('خطا در تبدیل فایل صوتی.');
          setBusy(false);
          setIsRecording(false);
        };
        reader.readAsDataURL(audioBlob);
      } catch {
        setSendError('خطا در ارسال ویس.');
        setBusy(false);
        setIsRecording(false);
      }
    };

    recorder.stop();
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      audioChunksRef.current = [];
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }
    setIsRecording(false);
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setBusy(true);
    setSendError(null);
    try {
      const dataUrl = await compressImage(file);
      const caption = draft.trim();
      await sendPayload({
        body: caption || 'تصویر',
        mediaType: 'image',
        mediaData: dataUrl,
      });
    } catch {
      setSendError('خطا در پردازش تصویر. لطفاً تصویر دیگری انتخاب کنید.');
      setBusy(false);
    }
  }

  async function onVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 4.2 * 1024 * 1024) {
      setSendError('حجم ویدیو نباید بیشتر از ۴٫۲ مگابایت باشد تا با سرعت اینترنت باشگاه به‌خوبی ارسال شود.');
      return;
    }

    setBusy(true);
    setSendError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const caption = draft.trim();
      await sendPayload({
        body: caption || 'ویدیو',
        mediaType: 'video',
        mediaData: dataUrl,
      });
    };
    reader.onerror = () => {
      setSendError('خطا در خواندن فایل ویدیو.');
      setBusy(false);
    };
    reader.readAsDataURL(file);
  }

  const partner = data?.coachName ?? data?.studentName ?? data?.adminName ?? null;
  const roleTitle = defaultRoleTitle ?? (user?.role === 'coach' ? 'شاگرد' : 'مربی');
  const messages = data?.messages ?? [];

  return (
    <section className="chat-screen" aria-label="گفتگو">
      <header className="chat-header">
        <Link className="chat-back-button" to={backTo} aria-label="بازگشت">
          <ArrowRight size={20} />
        </Link>
        <span className="chat-avatar" aria-hidden="true">
          {partner ? partner.trim().charAt(0) : <MessageCircle size={18} />}
        </span>
        <div className="chat-header__text">
          <strong>{partner ?? 'گفتگو'}</strong>
          <span>{roleTitle}</span>
        </div>
      </header>

      <div className="chat-log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite">
        {loadError && <p className="chat-notice chat-notice--error" role="alert">{loadError}</p>}
        {data === null && !loadError && <p className="chat-notice">در حال بارگذاری…</p>}
        {data && messages.length === 0 && (
          <div className="chat-empty">
            <MessageCircle size={32} />
            <p>هنوز پیامی رد و بدل نشده است.</p>
            <span>اولین پیام متنی، عکس یا پیام صوتی خود را ارسال کنید.</span>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.senderId === user?.id;
          const previous = messages[index - 1];
          const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
          const hasMedia = Boolean(message.mediaType && message.mediaType !== 'text' && message.mediaData);
          const isGenericCaption = message.body === 'پیام صوتی' || message.body === 'تصویر' || message.body === 'ویدیو';

          return (
            <div key={message.id}>
              {newDay && (
                <div className="chat-day">
                  <span>{dayLabel(message.createdAt)}</span>
                </div>
              )}
              <div className={`chat-row${mine ? ' chat-row--mine' : ''}`}>
                <div className={`chat-bubble${message.mediaType === 'image' ? ' chat-bubble--has-image' : ''}`}>
                  {/* Photo with full-screen lightbox trigger */}
                  {message.mediaType === 'image' && message.mediaData && (
                    <button
                      type="button"
                      className="chat-media-img-wrapper"
                      onClick={() =>
                        setActivePhoto({
                          src: message.mediaData!,
                          caption: !isGenericCaption ? message.body : undefined,
                          time: timeLabel(message.createdAt),
                          sender: mine ? 'شما' : partner ?? 'هم‌صحبت',
                        })
                      }
                      title="مشاهده تصویر در اندازه تمام‌صفحه"
                      aria-label="مشاهده تصویر در اندازه تمام‌صفحه"
                    >
                      <img src={message.mediaData} alt="تصویر ارسالی" className="chat-media-img" loading="lazy" />
                      <span className="chat-media-img-overlay">
                        <Maximize2 size={18} />
                        <span>تمام‌صفحه</span>
                      </span>
                    </button>
                  )}

                  {/* Voice note */}
                  {message.mediaType === 'voice' && message.mediaData && (
                    <div className="chat-voice-wrap">
                      <audio controls src={message.mediaData} className="chat-media-audio" preload="metadata" />
                    </div>
                  )}

                  {/* Video */}
                  {message.mediaType === 'video' && message.mediaData && (
                    <video controls src={message.mediaData} playsInline className="chat-media-video" preload="metadata" />
                  )}

                  {/* Text caption or body */}
                  {(!hasMedia || !isGenericCaption) && message.body && (
                    <p className="chat-body-text">{message.body}</p>
                  )}

                  {/* Telegram-style metadata: time and delivery ticks */}
                  <div className="chat-meta">
                    <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
                    {mine && (
                      <span className="chat-tick" title="ارسال شد">
                        <CheckCheck size={14} className="chat-tick-icon" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sendError && <p className="chat-notice chat-notice--error" role="alert">{sendError}</p>}

      {/* Hidden file pickers for images and videos */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        aria-label="انتخاب عکس برای ارسال"
        style={{ display: 'none' }}
        onChange={(e) => void onPhotoSelected(e)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        aria-label="انتخاب ویدیو برای ارسال"
        style={{ display: 'none' }}
        onChange={(e) => void onVideoSelected(e)}
      />

      {isRecording ? (
        <div className="chat-composer">
          <div className="chat-recording-panel">
            <div className="chat-recording-indicator">
              <span className="chat-recording-dot" />
              <span>در حال ضبط صدا: {formatSeconds(recordSeconds)}</span>
            </div>
            <div className="chat-recording-actions">
              <button
                type="button"
                className="button button--ghost"
                style={{ padding: '4px 10px', fontSize: 13, height: 'auto' }}
                onClick={cancelRecording}
              >
                <X size={15} /> لغو
              </button>
              <button
                type="button"
                className="button button--primary"
                style={{ padding: '4px 12px', fontSize: 13, height: 'auto' }}
                onClick={() => void stopAndSendRecording()}
              >
                <ArrowUp size={15} /> ارسال ویس
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form className="chat-composer" onSubmit={onSubmit}>
          <div className="chat-media-actions">
            <button
              type="button"
              className="chat-media-btn"
              title="ارسال پیام صوتی (ویس)"
              aria-label="ارسال پیام صوتی"
              onClick={() => void startRecording()}
              disabled={busy}
            >
              <Mic size={19} />
            </button>
            <button
              type="button"
              className="chat-media-btn"
              title="ارسال عکس یا تصویر"
              aria-label="ارسال تصویر"
              onClick={() => photoInputRef.current?.click()}
              disabled={busy}
            >
              <ImageIcon size={19} />
            </button>
            <button
              type="button"
              className="chat-media-btn"
              title="ارسال فیلم یا ویدیو"
              aria-label="ارسال ویدیو"
              onClick={() => videoInputRef.current?.click()}
              disabled={busy}
            >
              <VideoIcon size={19} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            maxLength={MESSAGE_MAX}
            rows={1}
            placeholder="پیام یا توضیحات بنویسید…"
            aria-label="متن پیام"
          />
          <button
            type="submit"
            className="chat-send"
            disabled={busy || draft.trim().length === 0}
            aria-label="ارسال پیام"
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </button>
        </form>
      )}

      {/* Telegram-style full-screen image lightbox */}
      {activePhoto && (
        <ChatPhotoLightbox
          photo={activePhoto}
          onClose={() => setActivePhoto(null)}
        />
      )}
    </section>
  );
}
