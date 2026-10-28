import { useState, type FormEvent } from 'react';
import { Link2, ShieldCheck } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useGym } from '../context/GymProvider';
import { ApiError, api, type PublicUser } from '../lib/api';
import { confirmModal } from './ConfirmModal';

/** Self-registered students grant coach access with a one-use invitation, not a guessed user ID. */
export function CoachConnection() {
  const { user, setUser, refresh } = useSession();
  const { activeSession, loading } = useGym();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ coachName: string; expiresAt: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user || user.role !== 'student' || !user.selfRegistered) return null;
  const accountId = user.id;
  const connected = user.coachId !== null && user.coachAccess !== false;
  const withdrawn = user.coachId !== null && user.coachAccess === false;

  async function previewCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setPreview(null); setConsent(false);
    try {
      const result = await api<{ coachName: string; expiresAt: string }>('POST', '/me/coach-invitation/preview', { accountId, code: code.trim() });
      setPreview(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'بررسی کد انجام نشد.');
    } finally { setBusy(false); }
  }

  async function accept() {
    if (!consent || activeSession || loading) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ user: PublicUser }>('POST', '/me/coach-invitation/accept', { accountId, code: code.trim(), consent: true });
      setUser(result.user);
      setCode(''); setPreview(null); setConsent(false);
    } catch (caught) {
      // If a response was lost, refresh before asking the user to retry a one-use code.
      await refresh();
      setError(caught instanceof ApiError && caught.status !== 0 ? caught.message : 'پاسخ اتصال دریافت نشد؛ وضعیت حساب را بررسی کن و دوباره تلاش کن.');
    } finally { setBusy(false); }
  }

  async function withdraw() {
    const confirmed = await confirmModal({
      title: 'قطع دسترسی مربی',
      message: 'مربی دیگر به برنامه و سوابق حساب تو دسترسی نخواهد داشت؛ گزارش‌های مالی خریدهای قبلی باقی می‌مانند. برنامهٔ مربی و خریدها پاک نمی‌شوند. درخواست‌هایی که پیش از قطع شروع شده‌اند ممکن است کامل شوند. تغییر مربی و بازگشت به برنامهٔ شخصی هنوز در دسترس نیست.',
      confirmText: 'قطع دسترسی', cancelText: 'انصراف', variant: 'warning',
    });
    if (!confirmed) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ user: PublicUser }>('POST', '/me/coach-access/withdraw', { accountId });
      setUser(result.user);
    } catch (caught) {
      await refresh();
      setError(caught instanceof ApiError && caught.status !== 0 ? caught.message : 'پاسخ قطع دسترسی دریافت نشد؛ وضعیت حساب را بررسی کن.');
    } finally { setBusy(false); }
  }

  return (
    <section className="coach-connection panel-card" aria-label="اتصال به مربی">
      <div className="coach-connection__heading"><span className="coach-connection__icon"><Link2 size={19} /></span><div>
        <span className="eyebrow">همراهی مربی</span>
        <h3>{connected ? 'حساب به مربی متصل است' : withdrawn ? 'دسترسی مربی قطع است' : 'از مربی کد دعوت داری؟'}</h3>
      </div></div>
      {connected ? <>
        <p>مربی به سوابق تمرین و دفتر خوراک دسترسی دارد؛ اشتراک پروفایل جداگانه در تنظیمات است. برنامه و خریدهای تو محفوظ‌اند.</p>
        <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void withdraw()}>قطع دسترسی مربی</button>
      </> : <>
        <p>{withdrawn ? 'برای برقراری دوباره، یک کد جدید از همان مربی بگیر. تغییر مربی فعلاً در دسترس نیست.' : 'حساب مستقل خودت را نگه دار؛ اگر مربی داری، با کد یک‌بارمصرف او وصل شو.'}</p>
        {activeSession && <p className="registration-note" role="status">پیش از اتصال، تمرین در حال انجام را تمام کن تا برنامه هنگام تغییر قطع نشود. در دستگاه‌های دیگر هم تمرین فعال را بررسی کن.</p>}
        <form className="coach-connection__form" onSubmit={(event) => void previewCode(event)}>
          <label className="field"><span>کد دعوت مربی</span><input dir="ltr" value={code} onChange={(event) => { setCode(event.target.value); setPreview(null); setConsent(false); }} autoCapitalize="none" spellCheck={false} minLength={32} maxLength={32} required /></label>
          <button className="button button--secondary" type="submit" disabled={busy || loading || Boolean(activeSession)}>{busy ? 'در حال بررسی…' : 'بررسی کد'}</button>
        </form>
        {preview && <div className="coach-connection__confirm">
          <strong><ShieldCheck size={16} /> اتصال به {preview.coachName}</strong>
          <p>با اتصال، مربی نام و شمارهٔ موبایل حساب، خلاصهٔ تمرین‌ها، دفتر خوراک و امکانات مدیریت برنامه را می‌بیند. پروفایل فقط با رضایت جداگانه به اشتراک می‌رود. گزارش‌های مالی خریدها برای مربی و مدیر باقی می‌ماند.</p>
          <p>برنامهٔ شخصی‌ات پاک نمی‌شود، اما پس از اتصال برنامهٔ مربی نمایش داده می‌شود؛ بازگشت به برنامهٔ شخصی یا تغییر مربی هنوز در دسترس نیست. پس از اتصال، برنامه را در دستگاه‌های دیگر تازه کن.</p>
          <label className="registration-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>نام مربی و محدودهٔ دسترسی را بررسی کردم و با این اتصال موافقم.</span></label>
          <button type="button" className="button button--primary" disabled={!consent || busy || loading || Boolean(activeSession)} onClick={() => void accept()}>{busy ? 'در حال اتصال…' : 'تأیید اتصال به مربی'}</button>
        </div>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
