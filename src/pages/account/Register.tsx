import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Dumbbell, Eye, EyeOff, KeyRound, User, UserRound, UsersRound } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { ApiError, api } from '../../lib/api';
import { AuthIntro } from './AuthIntro';

export function Register() {
  const { status, user, signIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<'student' | 'coach'>(params.get('role') === 'coach' ? 'coach' : 'student');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<{ username: string; pending: boolean; signInFailed: boolean } | null>(null);

  useEffect(() => { document.title = 'ساخت حساب | میتی'; }, []);
  if (status === 'signed-in' && user) return <Navigate to={user.role === 'student' ? '/' : '/coach'} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) { setError('تکرار رمز با رمز عبور یکسان نیست.'); return; }
    setBusy(true);
    try {
      const result = await api<{ username: string; pendingApproval: boolean }>('POST', '/auth/register', {
        role, displayName, phoneNumber, username, password, dataNoticeAccepted: noticeAccepted,
      });
      if (result.pendingApproval) {
        setCompleted({ username: result.username, pending: true, signInFailed: false });
      } else {
        try {
          await signIn(result.username, password);
          navigate('/', { replace: true });
        } catch {
          // The account was created even if the login request failed: do not submit it again.
          setCompleted({ username: result.username, pending: false, signInFailed: true });
        }
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ساخت حساب انجام نشد. دوباره تلاش کن.');
    } finally {
      setBusy(false);
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
              <Link to="/login" className="button button--primary">رفتن به ورود <ArrowRight size={16} /></Link>
            </div>
          ) : (
            <>
              <span className="auth-card-kicker">شروع با میتی</span>
              <h1>حساب خودت را بساز</h1>
              <p className="login-sub">مسیرت را انتخاب کن؛ ساخت حساب مربی اشتراک جداگانه ندارد.</p>
              <form className="login-form register-form" onSubmit={(event) => void submit(event)}>
                <fieldset className="registration-roles">
                  <legend>می‌خواهی چطور شروع کنی؟</legend>
                  <label className={`registration-role${role === 'student' ? ' is-selected' : ''}`}>
                    <input type="radio" name="role" value="student" checked={role === 'student'} onChange={() => setRole('student')} />
                    <UserRound size={21} /><span><strong>تمرین شخصی</strong><small>فعلاً بدون مربی</small></span>
                  </label>
                  <label className={`registration-role${role === 'coach' ? ' is-selected' : ''}`}>
                    <input type="radio" name="role" value="coach" checked={role === 'coach'} onChange={() => setRole('coach')} />
                    <UsersRound size={21} /><span><strong>مربی هستم</strong><small>مدیریت شاگردها</small></span>
                  </label>
                </fieldset>
                <p className="registration-note">{role === 'coach'
                  ? 'پس از تأیید مدیر وارد می‌شوی و می‌توانی برای شاگردانت حساب و برنامه بسازی.'
                  : 'حساب مستقل می‌سازی. اگر مربی داری، پس از ورود می‌توانی با کد دعوت و تأیید دسترسی به او وصل شوی.'}</p>
                <label className="login-field" htmlFor="register-name"><span>نام و نام خانوادگی</span><div className="login-input"><User size={18} aria-hidden="true" /><input id="register-name" autoComplete="name" minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div></label>
                <label className="login-field" htmlFor="register-phone"><span id="register-phone-label">شماره موبایل</span><div className="login-input"><input id="register-phone" aria-labelledby="register-phone-label" aria-describedby="register-phone-help" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} required /></div><small id="register-phone-help" className="field-hint">شماره برای ارتباط و پشتیبانی است؛ فعلاً تأیید پیامکی ندارد.</small></label>
                <label className="login-field" htmlFor="register-username"><span id="register-username-label">نام کاربری انگلیسی</span><div className="login-input"><User size={18} aria-hidden="true" /><input id="register-username" name="username" aria-labelledby="register-username-label" aria-describedby="register-username-help" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} required /></div><small id="register-username-help" className="field-hint">۳ تا ۳۲ نویسه؛ حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط.</small></label>
                <label className="login-field" htmlFor="register-password"><span id="register-password-label">رمز عبور</span><div className="login-input"><KeyRound size={18} aria-hidden="true" /><input id="register-password" name="password" aria-labelledby="register-password-label" aria-describedby="register-password-help" dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="login-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small id="register-password-help" className="field-hint">حداقل ۱۰ نویسه؛ از رمز تکراری استفاده نکن.</small></label>
                <label className="login-field" htmlFor="register-confirm"><span>تکرار رمز عبور</span><div className="login-input"><KeyRound size={18} aria-hidden="true" /><input id="register-confirm" dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div></label>
                <label className="registration-consent"><input type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} required /><span>می‌دانم اطلاعات حساب و داده‌های تمرینی برای همگام‌سازی روی سرور نگهداری می‌شوند. مدیر مشخصات حساب را می‌بیند.{role === 'student' && ' با اتصال به مربی، نام و شماره‌ام نیز در اختیار او قرار می‌گیرد.'} بازیابی رمز با پشتیبانی و بررسی هویت است؛ تأیید پیامکی و بازیابی خودکار وجود ندارد.</span></label>
                {error && <p className="login-error" role="alert">{error}</p>}
                <button className="login-submit" type="submit" disabled={busy}>{busy ? 'در حال ساخت حساب…' : role === 'coach' ? 'ثبت درخواست مربی' : 'ساخت حساب شخصی'}</button>
              </form>
              <p className="auth-back">از قبل حساب داری؟ <Link to="/login">وارد شو</Link></p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
