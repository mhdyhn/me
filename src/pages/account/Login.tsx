import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { AccountShell, homeFor } from './AccountShell';

export function Login() {
  const { status, user, signIn } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <AccountShell title="ورود به میتی">
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>نام کاربری</span>
          <input dir="ltr" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label className="field">
          <span>رمز عبور</span>
          <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? 'در حال ورود…' : 'ورود'}
        </button>
        <p className="account-muted">نام کاربری و رمز را مربی به شما می‌دهد. اگر رمز را گم کردید، از مربی بخواهید دوباره بسازد.</p>
      </form>
    </AccountShell>
  );
}
