import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { PanelPage, CredentialsCard, RequireRole } from './AccountShell';

/** Admin (the developer) creates coaches. Coaches are never created by anyone else. */
export function AdminHome() {
  return (
    <RequireRole roles={['admin']}>
      <AdminCoaches />
    </RequireRole>
  );
}

function AdminCoaches() {
  const [coaches, setCoaches] = useState<PublicUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load() {
    try {
      const result = await api<{ coaches: PublicUser[] }>('GET', '/coaches');
      setCoaches(result.coaches);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'فهرست مربی‌ها بارگذاری نشد.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const created = await api<{ user: PublicUser; username: string; password: string }>('POST', '/coaches', { displayName: name.trim() });
      setCredentials({ user: created.user, username: created.username, password: created.password });
      setName('');
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'مربی ساخته نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelPage title="مربی‌ها">
      {credentials ? (
        <CredentialsCard credentials={credentials} onDone={() => { setCredentials(null); void load(); }} />
      ) : (
        <form className="account-form account-form--inline" onSubmit={(event) => void addCoach(event)}>
          <label className="field">
            <span>نام مربی جدید</span>
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required />
          </label>
          <button type="submit" className="button button--primary" disabled={busy}>
            <UserPlus size={16} /> {busy ? 'در حال ساخت…' : 'ساخت مربی'}
          </button>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </form>
      )}
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {coaches && coaches.length === 0 && <p className="account-muted">هنوز مربی‌ای ساخته نشده است.</p>}
      {coaches && coaches.length > 0 && (
        <ul className="student-list">
          {coaches.map((coach) => (
            <li key={coach.id} className="student-row">
              <div>
                <strong>{coach.displayName}</strong>
                <span className="account-muted" dir="ltr">{coach.username}</span>
                {coach.mustChangePassword && <span className="badge">رمز موقت</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  );
}
