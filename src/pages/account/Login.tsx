import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Dumbbell, Eye, EyeOff, KeyRound, LogIn, Smartphone, User } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { InstallAppModal } from '../../components/InstallAppModal';
import { homeFor } from './AccountShell';
import { AuthIntro } from './AuthIntro';

export { SAVED_CREDENTIALS_KEY } from '../../lib/savedLogin';
import { getSavedCredentials, SAVED_CREDENTIALS_KEY, type SavedCredentials } from '../../lib/savedLogin';

/** Standalone sign-in screen. Nothing else in the app is reachable until this succeeds. */
export function Login() {
  const { status, user, signIn } = useSession();
  const navigate = useNavigate();

  const [savedCreds, setSavedCreds] = useState<SavedCredentials | null>(() => getSavedCredentials());
  const [username, setUsername] = useState(() => savedCreds?.username ?? '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => savedCreds?.remember ?? true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const msg = window.sessionStorage.getItem('meety:deactivated-message');
        if (msg) {
          window.sessionStorage.removeItem('meety:deactivated-message');
          return msg;
        }
      } catch {
        // Ignore
      }
    }
    return null;
  });
  const [busy, setBusy] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => {
    document.title = 'ورود به حساب کاربری | میتی — مربی تمرین شخصی';
  }, []);

  if (status === 'signed-in' && user) {
    return <Navigate to={user.mustChangePassword ? '/account/change-password' : homeFor(user.role)} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const cleanUsername = username.trim();
    try {
      const signedIn = await signIn(cleanUsername, password);

      // The browser's password manager can remember the password; the app stores only the username.
      try {
        if (rememberMe) {
          const payload: SavedCredentials = {
            username: cleanUsername,
            remember: true,
          };
          window.localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(payload));
          setSavedCreds(payload);
        } else {
          window.localStorage.removeItem(SAVED_CREDENTIALS_KEY);
          setSavedCreds(null);
        }
      } catch {
        // Ignore localStorage quota errors
      }

      navigate(signedIn.mustChangePassword ? '/account/change-password' : homeFor(signedIn.role), { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ورود انجام نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  function handleClearSaved() {
    setUsername('');
    setPassword('');
    try {
      window.localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    } catch {
      // Ignore
    }
    setSavedCreds(null);
  }

  return (
    <div className="login-screen">
      <div className="login-glow" aria-hidden="true" />
      <div className="auth-layout">
      <AuthIntro />
      <main className="login-card">
        <div className="login-brand">
          <span className="brand-mark"><Dumbbell size={22} strokeWidth={2.3} /></span>
          <div>
            <strong>میتی</strong>
            <small>مربی تمرین شخصی</small>
          </div>
        </div>

        <span className="auth-card-kicker">خوش آمدی به میتی</span>
        <h1>وارد حسابت شو</h1>
        <p className="login-sub">با نام کاربری و رمز خودت، یا اطلاعاتی که مربی یا مدیر به تو داده وارد شو.</p>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label className="login-field" htmlFor="login-username">
            <span>نام کاربری</span>
            <div className="login-input">
              <User size={18} aria-hidden="true" />
              <input
                id="login-username"
                name="username"
                dir="ltr"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
          </label>

          <label className="login-field" htmlFor="login-password">
            <span>رمز عبور</span>
            <div className="login-input">
              <KeyRound size={18} aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'پنهان کردن رمز' : 'نمایش رمز'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <div
            className="login-remember-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '2px 0 12px',
              fontSize: 13,
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
                color: 'var(--muted)',
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span>به‌خاطرسپاری نام کاربری</span>
            </label>

            {savedCreds && (
              <button
                type="button"
                className="button button--ghost button--small"
                style={{ fontSize: 11, padding: '2px 8px', height: 'auto', color: 'var(--muted)' }}
                onClick={handleClearSaved}
                title="پاک کردن اطلاعات ذخیره‌شده"
              >
                حذف ذخیره
              </button>
            )}
          </div>

          <p className="login-help">رمز در میتی ذخیره نمی‌شود؛ در صورت تمایل از مدیر رمز مرورگر استفاده کنید.</p>
          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" className="login-submit" disabled={busy}>
            <LogIn size={18} /> {busy ? 'در حال ورود…' : 'ورود'}
          </button>
        </form>

        <p className="login-help">رمز را فراموش کرده‌ای؟ با مربی یا پشتیبانی تماس بگیر؛ بازیابی حساب مستقل پس از بررسی هویت انجام می‌شود.</p>

        <div className="auth-signup-prompt">
          <div><strong>تازه به میتی پیوسته‌ای؟</strong><span>حساب شخصی یا مربی بساز.</span></div>
          <Link to="/register" className="button button--secondary">ساخت حساب</Link>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)', textAlign: 'center' }}>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => setShowInstallModal(true)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Smartphone size={15} /> نصب اپلیکیشن روی گوشی (فایل نصبی APK / وب‌اپ)
          </button>
        </div>
      </main>
      </div>

      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
