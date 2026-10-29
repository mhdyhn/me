import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Dumbbell, Eye, EyeOff, KeyRound, User, UserRound, UsersRound } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { ApiError, api } from '../../lib/api';
import { AuthIntro } from './AuthIntro';
import { tokenFromState } from '../../lib/coachRegistrationLink';

export function Register() {
  const { status, user, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteToken = tokenFromState(location.state);
  const [params] = useSearchParams();
  const [role, setRole] = useState<'student' | 'coach'>(!inviteToken && params.get('role') === 'coach' ? 'coach' : 'student');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<{ username: string; pending: boolean; signInFailed: boolean } | null>(null);

  useEffect(() => { document.title = 'ساخت حساب | میتی'; }, []);
  if (status === 'signed-in' && user) return <Navigate to={inviteToken ? '/invite' : user.role === 'student' ? '/' : '/coach'} state={inviteToken ? { inviteToken } : null} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || uncertain) return;
    setError('');
    if (password !== confirmation) { setError('تکرار رمز با رمز عبور یکسان نیست.'); return; }
    busyRef.current = true; setBusy(true);
    try {
      const result = await api<{ username: string; pendingApproval: boolean }>('POST', '/auth/register', {
        role, displayName, phoneNumber, username, password, dataNoticeAccepted: noticeAccepted,
      });
      if (!result || result.username !== username.trim().toLowerCase() || typeof result.pendingApproval !== 'boolean') throw new Error('Unconfirmed registration');
      if (result.pendingApproval) {
        setCompleted({ username: result.username, pending: true, signInFailed: false });
      } else {
        try {
          await signIn(result.username, password);
          navigate(inviteToken ? '/invite' : '/', { replace: true, state: inviteToken ? { inviteToken } : null });
        } catch {
          // The account was created even if the login request failed: do not submit it again.
          setCompleted({ username: result.username, pending: false, signInFailed: true });
        }
      }
    } catch (caught) {
      const unknown = !(caught instanceof ApiError) || caught.status === 0 || caught.status === 408 || caught.status >= 500 || (caught.status >= 200 && caught.status < 300);
      if (unknown) { setUncertain(true); setError(role === 'coach' ? 'نتیجهٔ درخواست مشخص نیست. ابتدا وضعیت درخواست را از مدیر بررسی کن؛ اگر ثبت نشده بود، دوباره تلاش کن.' : 'نتیجهٔ ثبت‌نام مشخص نیست. ابتدا با نام کاربری و رمز انتخابی وارد شو؛ اگر حساب ساخته نشده بود، سپس دوباره تلاش کن.'); }
      else setError(caught.message);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <div className="auth-layout auth-layout--register">
        <AuthIntro />
        <main className="login-card register-card">
          <div className="login-brand"><span className="brand-mark"><Dumbbell size={22} strokeWidth={2.3} /></span><div><strong>میتی</strong><small>همراه تمرین و مربی</small></div></div>
          {completed ? (
            <div className="registration-complete" role="status">
              <CheckCircle2 size={35} aria-hidden="true" />
              <h1>{completed.pending ? 'درخواستت ثبت شد' : 'حسابت ساخته شد'}</h1>
              <p>{completed.pending
                ? 'ثبت‌نام مربی پس از بررسی و تأیید مدیر فعال می‌شود. بعد از تأیید می‌توانی با همین نام کاربری و رمزی که انتخاب کردی وارد شوی.'
                : 'حساب ساخته شد، اما ورود خودکار کامل نشد. با همان نام کاربری و رمز انتخابی وارد شو.'}</p>
              <p>نام کاربری: <strong dir="ltr">{completed.username}</strong></p>
              {completed.signInFailed && <p>نیازی به ثبت‌نام دوباره نیست.</p>}
              <Link to="/login" state={inviteToken ? { inviteToken } : null} className="button button--primary">رفتن به ورود <ArrowRight size={16} /></Link>
            </div>
          ) : (
            <>
              <span className="auth-card-kicker">شروع با میتی</span>
              <h1>حساب خودت را بساز</h1>
              <p className="login-sub">مسیرت را انتخاب کن؛ ساخت حساب مربی اشتراک جداگانه ندارد.</p>
              <form className="login-form register-form" onSubmit={(event) => void submit(event)}>
                <fieldset className="registration-form-fields" disabled={busy || uncertain}>
                {!inviteToken && <fieldset className="registration-roles">
                  <legend>می‌خواهی چطور شروع کنی؟</legend>
                  <label className={`registration-role${role === 'student' ? ' is-selected' : ''}`}>
                    <input type="radio" name="role" value="student" checked={role === 'student'} onChange={() => setRole('student')} />
                    <UserRound size={21} /><span><strong>تمرین شخصی</strong><small>فعلاً بدون مربی</small></span>
                  </label>
                  <label className={`registration-role${role === 'coach' ? ' is-selected' : ''}`}>
                    <input type="radio" name="role" value="coach" checked={role === 'coach'} onChange={() => setRole('coach')} />
                    <UsersRound size={21} /><span><strong>مربی هستم</strong><small>مدیریت شاگردها</small></span>
                  </label>
                </fieldset>}
                <p className="registration-note">{inviteToken ? 'حساب شاگرد خودت را می‌سازی؛ اتصال به مربی پس از بررسی نام و تأیید تو انجام می‌شود.' : role === 'coach'
                  ? 'پس از تأیید مدیر وارد می‌شوی و می‌توانی برای شاگردانت حساب و برنامه بسازی.'
                  : 'حساب مستقل می‌سازی. اگر مربی داری، لینک او را باز کن یا پس از ورود با کد دعوت و تأیید دسترسی به او وصل شو.'}</p>
                <label className="login-field" htmlFor="register-name"><span>نام و نام خانوادگی</span><div className="login-input"><User size={18} aria-hidden="true" /><input id="register-name" autoComplete="name" minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div></label>
                <label className="login-field" htmlFor="register-phone"><span id="register-phone-label">شماره موبایل</span><div className="login-input"><input id="register-phone" aria-labelledby="register-phone-label" aria-describedby="register-phone-help" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} required /></div><small id="register-phone-help" className="field-hint">شماره برای ارتباط و پشتیبانی است؛ فعلاً تأیید پیامکی ندارد.</small></label>
                <label className="login-field" htmlFor="register-username"><span id="register-username-label">نام کاربری انگلیسی</span><div className="login-input"><User size={18} aria-hidden="true" /><input id="register-username" name="username" aria-labelledby="register-username-label" aria-describedby="register-username-help" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} required /></div><small id="register-username-help" className="field-hint">۳ تا ۳۲ نویسه؛ حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط.</small></label>
                <label className="login-field" htmlFor="register-password"><span id="register-password-label">رمز عبور</span><div className="login-input"><KeyRound size={18} aria-hidden="true" /><input id="register-password" name="password" aria-labelledby="register-password-label" aria-describedby="register-password-help" dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="login-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small id="register-password-help" className="field-hint">حداقل ۱۰ نویسه؛ از رمز تکراری استفاده نکن.</small></label>
                <label className="login-field" htmlFor="register-confirm"><span>تکرار رمز عبور</span><div className="login-input"><KeyRound size={18} aria-hidden="true" /><input id="register-confirm" dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div></label>
                <label className="registration-consent"><input type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} required /><span>می‌دانم اطلاعات حساب و داده‌های تمرینی برای همگام‌سازی روی سرور نگهداری می‌شوند. مدیر مشخصات حساب را می‌بیند.{role === 'student' && ' با اتصال به مربی، نام و شماره‌ام نیز در اختیار او قرار می‌گیرد.'} بازیابی رمز با پشتیبانی و بررسی هویت است؛ تأیید پیامکی و بازیابی خودکار وجود ندارد.</span></label>
                {error && <p className="login-error" role="alert">{error}</p>}
                <button className="login-submit" type="submit" disabled={busy || uncertain}>{busy ? 'در حال ساخت حساب…' : role === 'coach' ? 'ثبت درخواست مربی' : 'ساخت حساب شخصی'}</button>
                </fieldset>
                {uncertain && <div className="registration-retry"><Link to="/login" state={inviteToken ? { inviteToken } : null} className="button button--secondary">بررسی با ورود به حساب</Link><button type="button" className="button button--ghost" onClick={() => { setUncertain(false); setError(''); }}>پس از بررسی، دوباره ثبت‌نام کنم</button></div>}
              </form>
              <p className="auth-back">از قبل حساب داری؟ <Link to="/login" state={inviteToken ? { inviteToken } : null}>وارد شو</Link></p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
