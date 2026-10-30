import { useState } from 'react';
import { Search, ShieldCheck, Trash2 } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';

interface OwnerProfileCopy { userId: number; username: string; displayName: string; role: string }

/**
 * The owner's personal profile may never stay inside another account. This panel only removes
 * records that are an exact copy of the owner's own profile; a student's own profile is untouched.
 */
export function OwnerProfileCopies() {
  const [accounts, setAccounts] = useState<OwnerProfileCopy[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(''); setBusy(true);
    try {
      const result = await api<{ accounts: OwnerProfileCopy[] }>('GET', '/admin/owner-profile-copies');
      setAccounts(Array.isArray(result?.accounts) ? result.accounts : []);
      setChecked(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'بررسی نسخه‌های تکراری پروفایل انجام نشد.');
    } finally { setBusy(false); }
  };

  const clean = async () => {
    if (busy || !accounts?.length) return;
    const ok = await confirmModal({
      title: 'پاک‌کردن پروفایل حساب مالک از حساب‌های دیگر',
      message: `پروفایل تو در ${faNumber(accounts.length)} حساب دیگر ذخیره شده است. با پاک‌سازی، آن نسخه‌ها حذف می‌شوند و دسترسی مربی هم بسته می‌شود. پروفایل خودت و پروفایل واقعی شاگردها دست‌نخورده می‌ماند.`,
      confirmText: 'پاک‌سازی کن', cancelText: 'انصراف', variant: 'warning',
    });
    if (!ok) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ removed: OwnerProfileCopy[] }>('POST', '/admin/owner-profile-copies', {});
      const removed = Array.isArray(result?.removed) ? result.removed : [];
      setMessage(removed.length ? `پروفایل تو از ${faNumber(removed.length)} حساب پاک شد: ${removed.map((item) => item.username).join('، ')}.` : 'موردی برای پاک‌سازی نبود.');
      setAccounts([]);
      setChecked(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'پاک‌سازی انجام نشد.');
    } finally { setBusy(false); }
  };

  return (
    <section className="panel-card" aria-labelledby="owner-profile-copies-heading">
      <div className="admin-students-heading"><div><span className="eyebrow">حریم خصوصی</span><h3 id="owner-profile-copies-heading">پروفایل تو در حساب‌های دیگر</h3></div><ShieldCheck size={18} className="icon-accent" /></div>
      <p className="account-muted">اگر نسخه‌ای از پروفایل شخصی تو در حساب شاگردی ذخیره شده باشد، این‌جا دیده و پاک می‌شود. فقط نسخه‌هایی کپی‌شده حذف می‌شوند؛ پروفایل واقعی هر شاگرد دست‌نخورده می‌ماند.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="field-hint" role="status">{message}</p>}
      {!checked && <button type="button" className="button button--secondary" disabled={busy} onClick={() => void load()}>
        <Search size={16} /> {busy ? 'در حال بررسی…' : 'بررسی نسخه‌های تکراری'}
      </button>}
      {checked && accounts?.length === 0 && !message && <p className="account-muted">هیچ نسخهٔ تکراری از پروفایل تو پیدا نشد.</p>}
      {accounts && accounts.length > 0 && (
        <>
          <ul className="person-card-grid">
            {accounts.map((account) => <li key={account.userId}>
              <p><strong>{account.displayName}</strong> · <span dir="ltr">{account.username}</span></p>
            </li>)}
          </ul>
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => void clean()}>
            <Trash2 size={16} /> {busy ? 'در حال پاک‌سازی…' : 'پاک‌کردن نسخه‌های تکراری'}
          </button>
        </>
      )}
    </section>
  );
}
