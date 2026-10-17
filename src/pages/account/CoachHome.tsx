import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Apple, Ban, CheckCircle, KeyRound, ListChecks, MessageCircle, Receipt, Sparkles, TrendingUp, Trash2, UserPlus } from 'lucide-react';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { AdminHome } from './AdminHome';
import { PanelPage, CredentialsCard, RequireRole } from './AccountShell';
import { PersonCard } from './PersonCard';

interface StudentView extends PublicUser {
  password: string | null;
}

export function CoachHome() {
  return (
    <RequireRole roles={['coach']}>
      <CoachStudents />
    </RequireRole>
  );
}

function CoachStudents() {
  const [students, setStudents] = useState<StudentView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load() {
    try {
      const result = await api<{ students: StudentView[] }>('GET', '/students');
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
      void load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'شاگرد ساخته نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudent(student: PublicUser) {
    if (!window.confirm(`شاگرد ${student.displayName} و برنامهٔ او حذف شود؟ این کار برگشت ندارد.`)) return;
    try {
      await api('DELETE', `/students/${student.id}`, {});
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'شاگرد حذف نشد.');
    }
  }

  async function toggleStudentActive(student: StudentView) {
    const nextActive = student.isActive === false;
    const promptText = nextActive
      ? `شاگرد «${student.displayName}» دوباره فعال شود؟ پس از فعال‌سازی امکان ورود به برنامه را خواهد داشت.`
      : `شاگرد «${student.displayName}» غیرفعال شود؟ پس از غیرفعال‌سازی، از حساب خود خارج شده و امکان ورود نخواهد داشت.`;
    if (!window.confirm(promptText)) return;
    try {
      await api('PUT', `/students/${student.id}/active`, { active: nextActive });
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'تغییر وضعیت فعال‌سازی شاگرد انجام نشد.');
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
    <PanelPage title="شاگردهای من">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: '12px', flexWrap: 'wrap' }}>
        <Link to="/coach/transactions" className="button button--ghost">
          <Receipt size={16} /> درآمدها و تراکنش‌ها
        </Link>
        <Link to="/coach/chat" className="button button--ghost">
          <MessageCircle size={16} /> گفتگو با مدیر باشگاه
        </Link>
      </div>
      {credentials ? (
        <CredentialsCard
          credentials={credentials}
          onDone={() => { setCredentials(null); void load(); }}
          action={
            <Link to={`/coach/students/${credentials.user.id}/program`} className="button button--primary">
              <ListChecks size={16} /> ساخت برنامه برای {credentials.user.displayName}
            </Link>
          }
        />
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
        <ul className="person-card-grid">
          {students.map((student) => (
            <li key={student.id}>
              <PersonCard
                name={student.displayName}
                username={student.username}
                password={student.password}
                mustChangePassword={student.mustChangePassword}
                roleLabel="شاگرد"
                isActive={student.isActive !== false}
                actions={
                  <>
                    <Link className="button button--ghost" to={`/coach/students/${student.id}/program`}>
                      <ListChecks size={16} /> برنامه
                    </Link>
                    <Link className="button button--ghost" to={`/coach/students/${student.id}/nutrition`}>
                      <Apple size={16} /> تغذیه
                    </Link>
                    <Link className="button button--ghost" to={`/coach/students/${student.id}/progress`}>
                      <TrendingUp size={16} /> پیشرفت
                    </Link>
                    <Link className="button button--ghost" to={`/coach/students/${student.id}/ai`}>
                      <Sparkles size={16} /> هوش و پایش
                    </Link>
                    <Link className="button button--ghost" to={`/coach/students/${student.id}/chat`}>
                      <MessageCircle size={16} /> گفتگو
                    </Link>
                    <button
                      type="button"
                      className={`button ${student.isActive === false ? 'button--primary' : 'button--ghost'}`}
                      onClick={() => void toggleStudentActive(student)}
                      title={student.isActive === false ? 'فعال‌سازی مجدد شاگرد' : 'غیرفعال‌سازی موقت شاگرد'}
                    >
                      {student.isActive === false ? <CheckCircle size={16} /> : <Ban size={16} />}
                      {student.isActive === false ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => void resetPassword(student)}>
                      <KeyRound size={16} /> رمز تازه
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => void deleteStudent(student)}>
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

/** `/coach` shows the admin's coach list to the admin and the student list to a coach. */
export function CoachEntry() {
  const { user } = useSession();
  if (user?.role === 'admin') return <AdminHome />;
  return <CoachHome />;
}

/** The coach's "add program" step: pick a student, then build their program in the builder. */
export function ProgramPicker() {
  return (
    <RequireRole roles={['coach', 'admin']}>
      <PickStudent />
    </RequireRole>
  );
}

function PickStudent() {
  const [students, setStudents] = useState<PublicUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<{ students: PublicUser[] }>('GET', '/students')
      .then((result) => setStudents(result.students))
      .catch((caught: unknown) => setLoadError(caught instanceof ApiError ? caught.message : 'فهرست شاگردها بارگذاری نشد.'));
  }, []);

  return (
    <PanelPage title="افزودن برنامه">
      <p className="account-muted">شاگردی را انتخاب کنید تا برای او برنامه بسازید. برنامه از بین همهٔ حرکت‌ها انتخاب می‌شود و فقط همان حرکت‌ها برای شاگرد نمایش داده می‌شود.</p>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {students === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {students?.length === 0 && (
        <p className="account-muted">هنوز شاگردی ندارید. از بخش «شاگردها» یک شاگرد بسازید.</p>
      )}
      {students && students.length > 0 && (
        <ul className="student-list">
          {students.map((student) => (
            <li key={student.id} className="student-row">
              <div>
                <strong>{student.displayName}</strong>
                <span className="account-muted" dir="ltr">{student.username}</span>
              </div>
              <Link className="button button--primary" to={`/coach/students/${student.id}/program`}>
                <ListChecks size={16} /> ساخت برنامه
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  );
}
