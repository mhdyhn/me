import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { isOfflineBuild, scopeMatchesAccount } from '../lib/accountScope';
import { getStoredUser, getToken } from '../lib/api';
import { getPersonalSyncState } from '../lib/personalSync';
import { saveProgram } from '../lib/programPersistence';
import { parseProgramFile, programFileText } from '../lib/programFile';
import type { WorkoutTemplate } from '../types';
import { usePersonalSyncState } from './PersonalSync';

interface PendingFile { programme: WorkoutTemplate[]; base: WorkoutTemplate[]; accountId: number | null; token: string | null }
const MAX_INPUT_BYTES = 512 * 1024;
const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('خواندن فایل انجام نشد.'));
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('خواندن فایل انجام نشد.'));
  reader.readAsText(file);
});

/** An explicit, account-scoped programme file; it is never imported automatically. */
export function ProgramFilePanel({ program, hasActiveSession }: { program: WorkoutTemplate[]; hasActiveSession: boolean }) {
  const { user } = useSession();
  const sync = usePersonalSyncState();
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const ticket = useRef(0);
  const syncReady = () => {
    const state = getPersonalSyncState();
    return isOfflineBuild || (state.lastSyncAt !== null && !['idle', 'offline', 'error'].includes(state.phase) && !state.conflicts.some((conflict) => conflict.kind === 'program'));
  };
  const identityMatches = (accountId: number | null, token: string | null) => isOfflineBuild ||
    Boolean(user && user.id === accountId && token && getToken() === token && getStoredUser()?.id === accountId && scopeMatchesAccount(user));
  const ready = isOfflineBuild || (sync.lastSyncAt !== null && !['idle', 'offline', 'error'].includes(sync.phase) && !sync.conflicts.some((conflict) => conflict.kind === 'program'));

  async function selectFile(file: File | undefined) {
    const generation = ++ticket.current;
    setPending(null); setMessage('');
    if (!file) return;
    if (hasActiveSession) { setMessage('ابتدا تمرین فعال را تمام یا متوقف و همگام کن.'); return; }
    if (!syncReady()) { setMessage('ابتدا همگام‌سازی حساب را کامل و تعارض برنامه را بررسی کن.'); return; }
    if (file.size > MAX_INPUT_BYTES) { setMessage('حجم فایل نباید بیش از ۵۱۲ کیلوبایت باشد.'); return; }
    const accountId = user?.id ?? null;
    const token = getToken();
    if (!identityMatches(accountId, token)) { setMessage('حساب تغییر کرده است؛ صفحه را دوباره باز کن.'); return; }
    const base = structuredClone(program);
    setBusy(true);
    try {
      const programme = parseProgramFile(await readText(file));
      if (generation !== ticket.current) return;
      if (!identityMatches(accountId, token) || !syncReady()) throw new Error('حساب یا وضعیت همگام‌سازی تغییر کرده است؛ دوباره بررسی کن.');
      setPending({ programme, base, accountId, token });
    } catch (error) {
      if (generation === ticket.current) setMessage(error instanceof Error ? error.message : 'بررسی فایل انجام نشد.');
    } finally { if (generation === ticket.current) setBusy(false); }
  }

  async function restore() {
    if (!pending || busy) return;
    const current = () => identityMatches(pending.accountId, pending.token) && syncReady();
    if (hasActiveSession || !current()) { setMessage('حساب، تمرین فعال یا وضعیت همگام‌سازی تغییر کرده است؛ دوباره بررسی کن.'); return; }
    setBusy(true); setMessage('');
    try {
      await saveProgram(pending.programme, pending.base, { requireNoActiveSession: true, stillCurrent: current });
      setPending(null);
      setMessage(isOfflineBuild ? 'برنامه روی این دستگاه ذخیره شد.' : 'برنامه روی این دستگاه ذخیره شد؛ وضعیت همگام‌سازی را در تنظیمات بررسی کن.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'بازگردانی برنامه انجام نشد؛ فایل و برنامهٔ قبلی حفظ شدند.');
    } finally { setBusy(false); }
  }

  function download() {
    try {
      const file = new Blob([programFileText(program)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = url; link.download = 'meety-personal-program.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setMessage('ساخت فایل برنامه انجام نشد.'); }
  }

  return <details className="panel-card program-file-panel">
    <summary>فایل برنامهٔ شخصی</summary>
    <p className="account-muted small-text">فقط روزها و حرکت‌های برنامهٔ شخصی بازگردانی می‌شوند، نه پروفایل، وزنه‌ها، جلسه‌ها، راهنماهای اضافی فایل یا برنامهٔ مربی. فایل را محرمانه نگه دار؛ بازگردانی فقط پس از انتخاب و تأیید تو انجام می‌شود.</p>
    <div className="program-file-actions">
      <button type="button" className="button button--secondary button--small" onClick={download} disabled={busy || !program.length}><Download size={15} /> دریافت فایل برنامهٔ این دستگاه</button>
      <label className="button button--secondary button--small program-file-select"><Upload size={15} /> انتخاب فایل برنامه
        <input type="file" accept="application/json,.json" aria-label="انتخاب فایل برنامه" disabled={busy || hasActiveSession || !ready}
          onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void selectFile(file); }} />
      </label>
    </div>
    {hasActiveSession && <p className="field-hint">تا پایان یا توقف و همگام‌شدن تمرین فعال، بازگردانی در دسترس نیست.</p>}
    {!ready && <p className="field-hint">پیش از بازگردانی، همگام‌سازی حساب و تعارض برنامه را در تنظیمات بررسی کن.</p>}
    {pending && <div className="program-file-review">
      <strong>{pending.programme.length.toLocaleString('fa-IR')} روز در فایل پیدا شد</strong>
      <ol>{pending.programme.map((day) => <li key={day.id}>{day.name}</li>)}</ol>
      <p>با تأیید، برنامهٔ فعلی شخصی این حساب جایگزین می‌شود؛ سوابق و وزنه‌های ثبت‌شده تغییر نمی‌کنند. در صورت نیاز ابتدا فایل برنامهٔ فعلی را دریافت کن.</p>
      <div className="program-file-actions">
        <button type="button" className="button button--primary button--small" disabled={busy || hasActiveSession || !ready} onClick={() => void restore()}>تأیید و جایگزینی برنامه</button>
        <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => setPending(null)}>انصراف</button>
      </div>
    </div>}
    {message && <p role="status" className="small-text">{message}</p>}
  </details>;
}
