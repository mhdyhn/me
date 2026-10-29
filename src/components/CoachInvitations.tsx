import { useEffect, useState } from 'react';
import { Check, Copy, Link2, QrCode } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { ApiError, api, getStoredUser, getToken } from '../lib/api';
import { registrationLink, validRegistrationToken } from '../lib/coachRegistrationLink';
import { formatDate } from '../lib/format';
import { confirmModal } from './ConfirmModal';

/** Each coach can share one revocable link with multiple students. */
export function CoachInvitations() {
  const { user } = useSession();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [legacyCode, setLegacyCode] = useState('');
  const [legacyExpires, setLegacyExpires] = useState('');
  const [legacyCopied, setLegacyCopied] = useState(false);

  useEffect(() => {
    if (!showQr || !link) return;
    let current = true;
    setQr(''); setQrError(false);
    void import('qrcode').then((module) => module.toString(link, {
      type: 'svg', margin: 4, width: 224, errorCorrectionLevel: 'M', color: { dark: '#101812', light: '#ffffff' },
    })).then((svg) => { if (current) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (current) setQrError(true); });
    return () => { current = false; };
  }, [showQr, link]);

  async function create() {
    if (!user) return;
    const accountToken = getToken();
    setBusy(true); setError(''); setNotice(''); setCopied(false);
    try {
      const result = await api<{ token: string }>('POST', '/coach/registration-link', { accountId: user.id });
      if (getToken() !== accountToken || getStoredUser()?.id !== user.id) throw new Error('Account changed');
      if (!validRegistrationToken(result.token)) throw new Error('Invalid link');
      setLink(registrationLink(result.token)); setShowFallback(false);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'دریافت لینک انجام نشد. دوباره تلاش کن.'); }
    finally { setBusy(false); }
  }
  async function createLegacy() {
    if (!user) return;
    const accountToken = getToken();
    setBusy(true); setError(''); setNotice(''); setLegacyCopied(false);
    try {
      const result = await api<{ code: string; expiresAt: string }>('POST', '/coach/invitations', { accountId: user.id });
      if (getToken() !== accountToken || getStoredUser()?.id !== user.id) throw new Error('Account changed');
      if (!result || !/^[A-Za-z0-9_-]{32}$/.test(result.code) || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('Invalid code');
      setLegacyCode(result.code); setLegacyExpires(result.expiresAt);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'ساخت کد انجام نشد. دوباره تلاش کن.'); }
    finally { setBusy(false); }
  }
  async function copyLegacy() {
    try { await navigator.clipboard.writeText(legacyCode); setLegacyCopied(true); setError(''); }
    catch { setError('کپی خودکار ممکن نشد؛ کد را انتخاب و کپی کن.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setShowFallback(false); setError(''); }
    catch { setShowFallback(true); setError('کپی خودکار ممکن نشد؛ لینک زیر را انتخاب و کپی کن.'); }
  }
  async function revoke(legacy = false) {
    if (!user) return;
    const confirmed = await confirmModal(legacy ? {
      title: 'باطل‌کردن کدهای قدیمی', message: 'همهٔ کدهای یک‌بارمصرف استفاده‌نشده باطل شوند؟ لینک ثبت‌نام و اتصال‌های قبلی تغییر نمی‌کنند.',
      confirmText: 'باطل‌کردن کدها', cancelText: 'انصراف', variant: 'warning',
    } : {
      title: 'غیرفعال‌کردن لینک ثبت‌نام', message: 'لینک فعلی دیگر کار نخواهد کرد؛ شاگردهای متصل و اطلاعات آنها تغییری نمی‌کنند. بعداً می‌توانی لینک تازه بسازی.',
      confirmText: 'غیرفعال‌کردن لینک', cancelText: 'انصراف', variant: 'warning',
    });
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ ok: boolean }>('DELETE', legacy ? '/coach/invitations' : '/coach/registration-link', { accountId: user.id });
      if (!result || result.ok !== true) throw new Error('Unconfirmed revocation');
      if (!legacy) { setLink(''); setShowQr(false); setQr(''); setCopied(false); }
      else { setLegacyCode(''); setLegacyExpires(''); setLegacyCopied(false); }
      setNotice(legacy ? 'کدهای استفاده‌نشدهٔ قدیمی باطل شدند.' : 'لینک ثبت‌نام غیرفعال شد.');
    } catch (caught) { setError(caught instanceof ApiError && caught.status !== 0 && caught.status < 500 ? caught.message : 'نتیجهٔ غیرفعال‌کردن تأیید نشد؛ دوباره بررسی و تلاش کن.'); }
    finally { setBusy(false); }
  }

  return <details className="coach-invitations panel-card">
    <summary><Link2 size={18} /><span><strong>لینک ثبت‌نام شاگرد</strong><small>ثبت‌نام مستقیم با معرفی تو</small></span></summary>
    <p>لینک اختصاصی خودت را برای شاگردها بفرست. هر نفر ثبت‌نام یا وارد حسابش می‌شود و پس از دیدن نام تو، اتصال را تأیید می‌کند. یک لینک تا زمان غیرفعال‌شدن برای چند شاگرد قابل استفاده است.</p>
    <div className="coach-invitations__actions">
      <button type="button" className="button button--primary button--small" disabled={busy} onClick={() => void create()}>{link ? 'نمایش دوبارهٔ لینک' : 'دریافت لینک ثبت‌نام'}</button>
      <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void revoke()}>غیرفعال‌کردن لینک</button>
    </div>
    {link && <div className="coach-invitations__code" aria-live="polite">
      <span>لینک آمادهٔ ارسال است.</span>
      <button type="button" className="button button--secondary button--small" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'لینک کپی شد' : 'کپی لینک'}</button>
      <button type="button" className="button button--ghost button--small" aria-expanded={showQr} onClick={() => setShowQr((value) => !value)}><QrCode size={15} />{showQr ? 'پنهان‌کردن QR' : 'نمایش QR'}</button>
      {showFallback && <code dir="ltr">{link}</code>}
      {showQr && <div className="coach-invitations__qr">
        {qr ? <img src={qr} alt="QR لینک ثبت‌نام شاگرد" width="224" height="224" /> : qrError ? <p role="alert">ساخت QR ممکن نشد؛ لینک را کپی کن.</p> : <p role="status">در حال آماده‌سازی QR…</p>}
        <p>شاگرد با اسکن، صفحهٔ ثبت‌نام یا ورود را باز می‌کند؛ اتصال فقط پس از تأیید خود او انجام می‌شود.</p>
      </div>}
    </div>}
    <details className="coach-invitations__legacy"><summary>کدهای یک‌بارمصرف</summary>
      <p>در صورت نیاز می‌توانی مانند قبل کد محرمانهٔ یک‌بارمصرف بسازی؛ اعتبار آن حداکثر ۴۸ ساعت است. لینک ثبت‌نام برای استفادهٔ معمول ساده‌تر است.</p>
      <div className="coach-invitations__actions"><button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void createLegacy()}>ساخت کد یک‌بارمصرف</button><button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void revoke(true)}>باطل‌کردن کدهای استفاده‌نشده</button></div>
      {legacyCode && <div className="coach-invitations__code"><span>تا {formatDate(legacyExpires, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} معتبر است.</span><code dir="ltr">{legacyCode}</code><button type="button" className="button button--secondary button--small" onClick={() => void copyLegacy()}>{legacyCopied ? 'کد کپی شد' : 'کپی کد'}</button></div>}
    </details>
    {notice && <p role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
