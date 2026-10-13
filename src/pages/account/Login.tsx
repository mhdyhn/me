import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Dumbbell, Eye, EyeOff, KeyRound, LogIn, User } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { homeFor } from './AccountShell';

/** Standalone sign-in screen. Nothing else in the app is reachable until this succeeds. */
export function Login() {
  const { status, user, signIn } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in' && user) {
    return <Navigate to={user.mustChangePassword ? '/account/change-password' : homeFor(user.role)} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const signedIn = await signIn(username.trim(), password);
      navigate(signedIn.mustChangePassword ? '/account/change-password' : homeFor(signedIn.role), { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ورود انجام نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <main className="login-card">
        <div className="login-brand">
          <span className="brand-mark"><Dumbbell size={22} strokeWidth={2.3} /></span>
          <div>
            <strong>میتی</strong>
            <small>مربی تمرین شخصی</small>
          </div>
        </div>

        <h1>خوش آمدید</h1>
        <p className="login-sub">با نام کاربری و رمزی که مربی به شما داده وارد شوید.</p>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label className="login-field">
            <span>نام کاربری</span>
            <div className="login-input">
              <User size={18} aria-hidden="true" />
              <input dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} required />
            </div>
          </label>

          <label className="login-field">
            <span>رمز عبور</span>
            <div className="login-input">
              <KeyRound size={18} aria-hidden="true" />
              <input dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <button type="button" className="login-eye" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="login-submit" disabled={busy}>
            <LogIn size={18} /> {busy ? 'در حال ورود…' : 'ورود'}
          </button>
        </form>

        <p className="login-help">رمز را فراموش کرده‌اید؟ از مربی بخواهید رمز تازه بسازد.</p>
      </main>
    </div>
  );
}
