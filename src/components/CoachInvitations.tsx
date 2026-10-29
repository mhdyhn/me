import { useEffect, useState } from 'react';
import { Check, Copy, Link2, QrCode } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { confirmModal } from './ConfirmModal';

/** A coach can invite a student who creates their own account, alongside manual student creation. */
export function CoachInvitations() {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState('');
  const [qrError, setQrError] = useState(false);

  // Encode the secret locally; it is never sent to a QR generation service.
  useEffect(() => {
    if (!showQr || !invite) return;
    let current = true;
    setQr(''); setQrError(false);
    void import('qrcode').then((module) => module.toString(invite.code, {
      type: 'svg', margin: 4, width: 224, errorCorrectionLevel: 'M',
      color: { dark: '#101812', light: '#ffffff' },
    })).then((svg) => {
      if (current) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }).catch(() => { if (current) setQrError(true); });
    return () => { current = false; };
  }, [showQr, invite]);

  async function create() {
    setBusy(true); setError(''); setNotice(''); setCopied(false); setShowQr(false); setQr('');
    try {
      setInvite(await api<{ code: string; expiresAt: string }>('POST', '/coach/invitations', {}));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ساخت کد دعوت انجام نشد.');
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.code); setCopied(true); }
    catch { setError('کپی خودکار ممکن نشد؛ کد را دستی انتخاب و ارسال کن.'); }
  }

  async function revoke() {
    const confirmed = await confirmModal({
      title: 'باطل‌کردن کدهای دعوت',
      message: 'همهٔ کدهای استفاده‌نشدهٔ تو باطل شوند؟ اتصال‌هایی که قبلاً انجام شده‌اند تغییر نمی‌کنند.',
      confirmText: 'باطل‌کردن کدها', cancelText: 'انصراف', variant: 'warning',
    });
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('DELETE', '/coach/invitations', {});
      setInvite(null); setShowQr(false); setQr(''); setNotice('کدهای استفاده‌نشده باطل شدند.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'باطل‌کردن کدها انجام نشد.');
    } finally { setBusy(false); }
  }

  return (
    <details className="coach-invitations panel-card">
      <summary><Link2 size={18} /><span><strong>دعوت شاگرد با حساب خودش</strong><small>در کنار ساخت دستی شاگرد</small></span></summary>
      <p>برای هر شاگرد یک کد جدا بساز و محرمانه برای خودش بفرست. کد یک‌بارمصرف است و حداکثر ۴۸ ساعت اعتبار دارد. شاگرد باید پس از ورود، نام مربی و دسترسی را تأیید کند.</p>
      <div className="coach-invitations__actions">
        <button type="button" className="button button--primary button--small" disabled={busy} onClick={() => void create()}>ساخت کد دعوت</button>
        <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void revoke()}>باطل‌کردن کدهای استفاده‌نشده</button>
      </div>
      {invite && <div className="coach-invitations__code" aria-live="polite">
        <span>این کد فقط هنگام ساخت نمایش داده می‌شود:</span>
        <code dir="ltr">{invite.code}</code>
        <button type="button" className="button button--secondary button--small" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'کپی شد' : 'کپی کد'}</button>
        <button type="button" className="button button--ghost button--small" aria-expanded={showQr} onClick={() => setShowQr((value) => !value)}><QrCode size={15} />{showQr ? 'پنهان‌کردن QR' : 'نمایش QR'}</button>
        {showQr && <div className="coach-invitations__qr">
          {qr ? <img src={qr} alt="کد QR دعوت محرمانهٔ شاگرد" width="224" height="224" /> : qrError ? <p role="alert">ساخت QR ممکن نشد؛ کد بالا را کپی کن.</p> : <p role="status">در حال آماده‌سازی QR…</p>}
          <p>شاگرد کد را اسکن و کپی کند و در بخش «اتصال به مربی» وارد کند. اتصال فقط پس از بررسی نام مربی و رضایت شاگرد انجام می‌شود. QR را مثل خود کد محرمانه نگه دار.</p>
        </div>}
      </div>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </details>
  );
}
