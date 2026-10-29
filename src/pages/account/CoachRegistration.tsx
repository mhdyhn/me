import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Link2, ShieldCheck } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { useGym } from '../../context/GymProvider';
import { ApiError, api, getStoredUser, getToken, type PublicUser } from '../../lib/api';
import { clearRegistrationToken, rememberRegistrationToken, storedRegistrationToken, tokenFromState, validRegistrationToken } from '../../lib/coachRegistrationLink';

type Preview = { coachId: number; coachName: string };

/** Opening a link never connects an account: the student sees the coach and opts in. */
export function CoachRegistration() {
  const location = useLocation();
  const { status, user, setUser, refresh } = useSession();
  const { activeSession, loading } = useGym();
  const token = useMemo(() => {
    const hash = location.hash.slice(1);
    // An explicitly malformed link must never fall back to a different older invitation.
    if (hash) return validRegistrationToken(hash) ? hash : null;
    return tokenFromState(location.state) ?? storedRegistrationToken();
  }, [location.hash, location.state]);
  const currentToken = useRef(token);
  currentToken.current = token;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { setConsent(false); setDone(false); }, [token]);

  useEffect(() => {
    if (!token) { clearRegistrationToken(); setError('لینک دعوت پیدا نشد یا معتبر نیست. از مربی بخواه لینک را دوباره بفرستد.'); return; }
    rememberRegistrationToken(token);
    // The link token need not remain in the address bar or browser history.
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    let current = true;
    setError(''); setPreview(null);
    void api<Preview>('POST', '/coach-registration-link/preview', { token }).then((result) => {
      if (!Number.isSafeInteger(result.coachId) || typeof result.coachName !== 'string' || !result.coachName.trim()) throw new Error('Invalid preview');
      if (current) setPreview(result);
    }).catch((caught) => { if (current) setError(caught instanceof ApiError ? caught.message : 'بررسی لینک انجام نشد؛ اتصال را بررسی و دوباره تلاش کن.'); });
    return () => { current = false; };
  }, [token, attempt]);

  async function accept() {
    if (!token || !user || !preview || !consent || activeSession || loading || busy) return;
    const accountToken = getToken();
    setBusy(true); setError('');
    try {
      const result = await api<{ user: PublicUser }>('POST', '/me/coach-registration-link/accept', { accountId: user.id, token, consent: true });
      if (currentToken.current !== token || getToken() !== accountToken || getStoredUser()?.id !== user.id) throw new Error('Account changed');
      if (!result.user || result.user.id !== user.id || result.user.username !== user.username || result.user.role !== 'student' || result.user.selfRegistered !== true || typeof result.user.displayName !== 'string' || typeof result.user.mustChangePassword !== 'boolean' || result.user.coachId !== preview.coachId || result.user.coachAccess !== true) throw new Error('Unconfirmed connection');
      setUser(result.user); clearRegistrationToken(); setDone(true);
    } catch (caught) {
      await refresh();
      setError(caught instanceof ApiError && caught.status !== 0 && caught.status < 500 ? caught.message : 'نتیجهٔ اتصال تأیید نشد؛ وضعیت حسابت را بررسی کن و دوباره تلاش کن.');
    } finally { setBusy(false); }
  }
  const state = token ? { inviteToken: token } : null;
  const connected = user?.role === 'student' && user.coachId != null && user.coachAccess !== false;
  return <main className="login-screen invite-screen"><section className="panel-card invite-card" aria-labelledby="invite-title">
    <span className="invite-card__icon"><Link2 size={22} /></span><span className="eyebrow">دعوت به میتی</span>
    <h1 id="invite-title">شروع تمرین با مربی</h1>
    {!preview && !error && <p role="status">در حال بررسی لینک مربی…</p>}
    {preview && <p>این لینک برای ثبت‌نام با معرفی <strong>{preview.coachName}</strong> است.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {error && token && !preview && <button type="button" className="button button--secondary button--small" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button>}
    {preview && status === 'loading' && <p role="status">در حال بررسی حساب…</p>}
    {preview && status === 'signed-out' && <>
      <p>حسابت را بساز یا اگر حساب داری وارد شو. اتصال به مربی تنها پس از تأیید خودت انجام می‌شود.</p>
      <div className="invite-card__actions"><Link className="button button--primary" to="/register" state={state}>ثبت‌نام شاگرد</Link><Link className="button button--secondary" to="/login" state={state}>ورود به حساب موجود</Link></div>
    </>}
    {preview && status === 'signed-in' && user?.mustChangePassword && <>
      <p>برای ادامه ابتدا رمز موقت خود را تغییر بده.</p><Link className="button button--secondary" to="/account/change-password" state={state}>تغییر رمز</Link>
    </>}
    {preview && status === 'signed-in' && user && !user.mustChangePassword && (done || connected && user.coachId === preview.coachId) && <>
      <p role="status">حساب {user.displayName} به این مربی متصل است.</p><Link className="button button--primary" to="/">ورود به برنامه</Link>
    </>}
    {preview && status === 'signed-in' && user && !user.mustChangePassword && !done && connected && user.coachId !== preview.coachId && <>
      <p>حساب {user.displayName} اکنون به مربی دیگری متصل است. برای تغییر، ابتدا دسترسی مربی فعلی را در تنظیمات قطع کن.</p>
      <Link className="button button--secondary" to="/settings">تنظیمات حساب</Link>
    </>}
    {preview && status === 'signed-in' && user && !user.mustChangePassword && !done && !connected && (user.role !== 'student' || !user.selfRegistered) && <>
      <p>این مسیر برای حسابی است که شاگرد خودش ثبت کرده است. با حساب شاگرد خودثبت‌نامی وارد شو؛ حساب‌های دستی بدون تغییر باقی می‌مانند.</p><Link className="button button--secondary" to="/">بازگشت به حساب</Link>
    </>}
    {preview && status === 'signed-in' && user?.role === 'student' && !user.mustChangePassword && user.selfRegistered && !connected && !done && <>
      <p>حساب فعلی: <strong>{user.displayName}</strong>. مربی با اتصال به سوابق تمرین و دفتر خوراک دسترسی پیدا می‌کند؛ اشتراک پروفایل جداگانه در تنظیمات است. خریدها و سوابق قبلی حفظ می‌شوند.</p>
      {activeSession && <p className="form-error" role="status">ابتدا تمرین فعال را تمام و همگام کن، سپس اتصال را تأیید کن.</p>}
      <label className="invite-card__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>نام مربی و سطح دسترسی را دیدم و با اتصال این حساب موافقم.</span></label>
      <button type="button" className="button button--primary" disabled={!consent || busy || loading || Boolean(activeSession)} onClick={() => void accept()}><ShieldCheck size={16} />{busy ? 'در حال اتصال…' : 'تأیید و اتصال به مربی'}</button>
    </>}
  </section></main>;
}
