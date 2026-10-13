import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MessageCircle, Receipt, Trash2, UserPlus, Users } from 'lucide-react';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { PanelPage, CredentialsCard, RequireRole } from './AccountShell';
import { PersonCard } from './PersonCard';

interface CoachSummary extends PublicUser {
  studentCount: number;
  password: string | null;
}

/** The admin (the developer) creates coaches, gives them a username and password, and can regenerate a password. */
export function AdminHome() {
  return (
    <RequireRole roles={['admin']}>
      <AdminCoaches />
    </RequireRole>
  );
}

function AdminCoaches() {
  const [coaches, setCoaches] = useState<CoachSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load() {
    try {
      const result = await api<{ coaches: CoachSummary[] }>('GET', '/coaches');
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

  async function resetPassword(coach: PublicUser) {
    if (!window.confirm(`رمز ${coach.displayName} دوباره ساخته شود؟ با رمز قبلی دیگر نمی‌تواند وارد شود.`)) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/coaches/${coach.id}/reset-password`, {});
      setCredentials({ user: coach, username: result.username, password: result.password });
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'رمز ساخته نشد.');
    }
  }

  async function deleteCoach(coach: CoachSummary) {
    if (!window.confirm(`مربی ${coach.displayName} حذف شود؟ این کار برگشت ندارد.`)) return;
    try {
      await api('DELETE', `/coaches/${coach.id}`, {});
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'مربی حذف نشد.');
    }
  }

  return (
    <PanelPage title="مربی‌ها">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <Link to="/coach/admin/transactions" className="button button--ghost">
          <Receipt size={16} /> تراکنش‌ها و درآمدهای باشگاه
        </Link>
      </div>
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
      {coaches === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {coaches?.length === 0 && <p className="account-muted">هنوز مربی‌ای ساخته نشده است. بالا یکی بسازید.</p>}

      {coaches && coaches.length > 0 && (
        <ul className="person-card-grid">
          {coaches.map((coach) => (
            <li key={coach.id}>
              <PersonCard
                name={coach.displayName}
                username={coach.username}
                password={coach.password}
                mustChangePassword={coach.mustChangePassword}
                roleLabel="مربی"
                badges={<span className="badge"><Users size={13} /> {coach.studentCount} شاگرد</span>}
                actions={
                  <>
                    <Link className="button button--ghost" to={`/coach/coaches/${coach.id}/chat`}>
                      <MessageCircle size={16} /> گفتگو
                    </Link>
                    <button type="button" className="button button--ghost" onClick={() => void resetPassword(coach)}>
                      <KeyRound size={16} /> رمز تازه
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={coach.studentCount > 0}
                      title={coach.studentCount > 0 ? 'اول شاگردهای این مربی را حذف کنید' : undefined}
                      onClick={() => void deleteCoach(coach)}
                    >
                      <Trash2 size={16} /> حذف
                    </button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  );
}
