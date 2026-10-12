import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, ListChecks, UserPlus } from 'lucide-react';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { AdminHome } from './AdminHome';
import { AccountShell, CredentialsCard, RequireRole } from './AccountShell';

export function CoachHome() {
  return (
    <RequireRole roles={['coach']}>
      <CoachStudents />
    </RequireRole>
  );
}

function CoachStudents() {
  const [students, setStudents] = useState<PublicUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load() {
    try {
      const result = await api<{ students: PublicUser[] }>('GET', '/students');
      setStudents(result.students);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'فهرست شاگردها بارگذاری نشد.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const created = await api<{ user: PublicUser; username: string; password: string }>('POST', '/students', { displayName: name.trim() });
      setCredentials({ user: created.user, username: created.username, password: created.password });
      setName('');
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'شاگرد ساخته نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(student: PublicUser) {
    if (!window.confirm(`رمز ${student.displayName} دوباره ساخته شود؟ با رمز قبلی دیگر نمی‌تواند وارد شود.`)) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/students/${student.id}/reset-password`, {});
      setCredentials({ user: student, username: result.username, password: result.password });
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'رمز ساخته نشد.');
    }
  }

  return (
    <AccountShell title="شاگردهای من">
      {credentials ? (
        <CredentialsCard credentials={credentials} onDone={() => { setCredentials(null); void load(); }} />
      ) : (
        <form className="account-form account-form--inline" onSubmit={(event) => void addStudent(event)}>
          <label className="field">
            <span>نام شاگرد جدید</span>
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required />
          </label>
          <button type="submit" className="button button--primary" disabled={busy}>
            <UserPlus size={16} /> {busy ? 'در حال ساخت…' : 'ساخت شاگرد'}
          </button>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </form>
      )}

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {students === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {students?.length === 0 && <p className="account-muted">هنوز شاگردی ندارید. بالا یک شاگرد بسازید.</p>}

      {students && students.length > 0 && (
        <ul className="student-list">
          {students.map((student) => (
            <li key={student.id} className="student-row">
              <div>
                <strong>{student.displayName}</strong>
                <span className="account-muted" dir="ltr">{student.username}</span>
                {student.mustChangePassword && <span className="badge">رمز موقت</span>}
              </div>
              <div className="student-row__actions">
                <Link className="button button--ghost" to={`/coach/students/${student.id}/program`}>
                  <ListChecks size={16} /> برنامه
                </Link>
                <button type="button" className="button button--ghost" onClick={() => void resetPassword(student)}>
                  <KeyRound size={16} /> رمز تازه
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}

/** `/coach` shows the admin's coach list to the admin and the student list to a coach. */
export function CoachEntry() {
  const { user } = useSession();
  if (user?.role === 'admin') return <AdminHome />;
  return <CoachHome />;
}
