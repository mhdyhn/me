import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { AccountShell, homeFor } from './AccountShell';

const MIN_PASSWORD = 8;

export function ChangePassword() {
  const { status, user, refresh } = useSession();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status !== 'signed-in' || !user) return <Navigate to="/login" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) return setError(`رمز جدید باید حداقل ${MIN_PASSWORD} نویسه باشد.`);
    if (next !== confirm) return setError('تکرار رمز جدید با رمز جدید یکی نیست.');
    setBusy(true);
    try {
      await api('POST', '/me/password', { currentPassword: current, newPassword: next });
      await refresh();
      navigate(homeFor(user!.role), { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تغییر رمز انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell title={user.mustChangePassword ? 'رمز تازهٔ خود را انتخاب کنید' : 'تغییر رمز عبور'}>
      {user.mustChangePassword && (
        <p className="account-muted">رمز موقتی را که به شما داده شده وارد کنید. بعد از این مرحله فقط شما رمز جدید را می‌دانید.</p>
      )}
      <p className="account-muted">با تغییر رمز، نشست همین دستگاه حفظ و نشست دستگاه‌های دیگر باطل می‌شود. برای ورود دوباره از رمز جدید استفاده کنید؛ اطلاعات محلی پاک نمی‌شود.</p>
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>رمز فعلی</span>
          <input dir="ltr" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
        </label>
        <label className="field">
          <span>رمز جدید (حداقل {MIN_PASSWORD} نویسه)</span>
          <input dir="ltr" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required />
        </label>
        <label className="field">
          <span>تکرار رمز جدید</span>
          <input dir="ltr" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'در حال ذخیره…' : 'ذخیرهٔ رمز جدید'}
        </button>
      </form>
    </AccountShell>
  );
}
