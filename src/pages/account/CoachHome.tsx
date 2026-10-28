import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Apple, Ban, CheckCircle, KeyRound, ListChecks, MessageCircle, MoreHorizontal, Receipt, Sparkles, TrendingUp, Trash2, UserPlus, UserRound } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { CoachInvitations } from '../../components/CoachInvitations';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
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
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatus, setStudentStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load() {
    setLoadingStudents(true);
    setLoadError(null);
    try {
      const result = await api<{ students: StudentView[] }>('GET', '/students');
      setStudents(result.students);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'فهرست شاگردها بارگذاری نشد.');
    } finally {
      setLoadingStudents(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const normalizedQuery = studentSearch.trim().toLocaleLowerCase();
  const visibleStudents = students?.filter((student) => {
    const matchesQuery = !normalizedQuery
      || student.displayName.toLocaleLowerCase().includes(normalizedQuery)
      || student.username.toLocaleLowerCase().includes(normalizedQuery);
    const active = student.isActive !== false;
    const matchesStatus = studentStatus === 'all' || (studentStatus === 'active' ? active : !active);
    return matchesQuery && matchesStatus;
  }) ?? [];

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const created = await api<{ user: PublicUser; username: string; password: string }>('POST', '/students', { displayName: name.trim(), phoneNumber });
      setCredentials({ user: created.user, username: created.username, password: created.password });
      setName('');
      setPhoneNumber('');
      void load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'شاگرد ساخته نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudent(student: PublicUser) {
    const ok = await confirmModal({
      title: 'حذف شاگرد',
      message: `شاگرد «${student.displayName}» و برنامهٔ او حذف شود؟ این کار برگشت ندارد.`,
      confirmText: 'حذف شاگرد',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api('DELETE', `/students/${student.id}`, {});
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'شاگرد حذف نشد.');
    }
  }

  async function toggleStudentActive(student: StudentView) {
    const nextActive = student.isActive === false;
    const ok = await confirmModal({
      title: nextActive ? 'فعال‌سازی شاگرد' : 'غیرفعال‌سازی شاگرد',
      message: nextActive
        ? `شاگرد «${student.displayName}» دوباره فعال شود؟ پس از فعال‌سازی امکان ورود به برنامه را خواهد داشت.`
        : `شاگرد «${student.displayName}» غیرفعال شود؟ پس از غیرفعال‌سازی، از حساب خود خارج شده و امکان ورود نخواهد داشت.`,
      confirmText: nextActive ? 'فعال‌سازی' : 'غیرفعال‌سازی',
      cancelText: 'انصراف',
      variant: nextActive ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      await api('PUT', `/students/${student.id}/active`, { active: nextActive });
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'تغییر وضعیت فعال‌سازی شاگرد انجام نشد.');
    }
  }

  async function resetPassword(student: PublicUser) {
    const ok = await confirmModal({
      title: 'ساخت مجدد رمز عبور',
      message: `رمز جدید برای «${student.displayName}» ساخته شود؟ با رمز قبلی دیگر نمی‌تواند وارد شود.`,
      confirmText: 'ساخت رمز جدید',
      cancelText: 'انصراف',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/students/${student.id}/reset-password`, {});
      setCredentials({ user: student, username: result.username, password: result.password });
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'رمز ساخته نشد.');
    }
  }

  return (
    <PanelPage title="شاگردهای من">
      <div className="coach-welcome">
        <div><span className="coach-welcome__label">فضای مربی</span><h3>همراه شاگردها، قدم‌به‌قدم.</h3><p>شاگرد جدید بساز، برنامه‌ها را مدیریت کن و سهم فروش را یک‌جا ببین.</p></div>
        <div className="coach-welcome__count"><strong>{students ? faNumber(students.length) : '—'}</strong><span>شاگرد</span></div>
      </div>
      <CoachInvitations />
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
          <label className="field" htmlFor="student-phone"><span id="student-phone-label">شماره موبایل شاگرد</span><input id="student-phone" aria-labelledby="student-phone-label" aria-describedby="student-phone-help" dir="ltr" type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} required /><small id="student-phone-help" className="field-hint">فعلاً تأیید پیامکی ندارد.</small></label>
          <button type="submit" className="button button--primary" disabled={busy}>
            <UserPlus size={16} /> {busy ? 'در حال ساخت…' : 'ساخت شاگرد'}
          </button>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </form>
      )}

      {loadError && (
        <div className="coach-student-load-error" role="alert">
          <p className="form-error">{loadError}</p>
          <button type="button" className="button button--secondary button--small" disabled={loadingStudents} onClick={() => void load()}>
            تلاش دوباره برای بارگذاری شاگردها
          </button>
        </div>
      )}
      {students === null && !loadError && <p className="account-muted" role="status">در حال بارگذاری…</p>}
      {students?.length === 0 && <p className="account-muted">هنوز شاگردی ندارید. بالا یک شاگرد بسازید.</p>}

      {students && students.length > 0 && (
        <>
          <section className="coach-student-filters" aria-label="جست‌وجو و فیلتر شاگردها">
            <label className="field">
              <span>جست‌وجوی نام یا نام کاربری</span>
              <input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="نام یا نام کاربری" />
            </label>
            <label className="field">
              <span>وضعیت حساب</span>
              <select aria-label="وضعیت حساب" value={studentStatus} onChange={(event) => setStudentStatus(event.target.value as 'all' | 'active' | 'inactive')}>
                <option value="all">همهٔ شاگردها</option>
                <option value="active">فعال</option>
                <option value="inactive">غیرفعال</option>
              </select>
            </label>
            <p className="account-muted" role="status">نمایش {faNumber(visibleStudents.length)} از {faNumber(students.length)} شاگرد</p>
          </section>
          {visibleStudents.length === 0 ? (
            <div className="coach-student-empty">
              <p className="account-muted">شاگردی با این جست‌وجو و فیلتر پیدا نشد.</p>
              <button type="button" className="button button--ghost button--small" onClick={() => { setStudentSearch(''); setStudentStatus('all'); }}>پاک‌کردن فیلترها</button>
            </div>
          ) : (
            <ul className="person-card-grid">
              {visibleStudents.map((student) => (
                <li key={student.id}>
                  <PersonCard
                    name={student.displayName}
                    username={student.username}
                    phoneNumber={student.phoneNumber}
                    password={student.password}
                    mustChangePassword={student.mustChangePassword}
                    roleLabel="شاگرد"
                    isActive={student.isActive !== false}
                    actions={
                      <>
                        <Link className="button button--primary" to={`/coach/students/${student.id}/program`}>
                          <ListChecks size={16} /> برنامه
                        </Link>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/progress`}>
                          <TrendingUp size={16} /> پیشرفت
                        </Link>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/chat`}>
                          <MessageCircle size={16} /> گفتگو
                        </Link>
                        <details className="person-card__more-actions">
                          <summary aria-label={`بخش‌های دیگر برای ${student.displayName}`}><MoreHorizontal size={17} /> بیشتر</summary>
                          <div className="person-card__more-actions-menu">
                            <Link className="button button--ghost" to={`/coach/students/${student.id}/nutrition`}>
                              <Apple size={16} /> تغذیه
                            </Link>
                            <Link className="button button--ghost" to={`/coach/students/${student.id}/profile`}>
                              <UserRound size={16} /> پروفایل
                            </Link>
                            <Link className="button button--ghost" to={`/coach/students/${student.id}/ai`}>
                              <Sparkles size={16} /> هوش و پایش
                            </Link>
                            {!student.selfRegistered && <>
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
                            </>}
                          </div>
                        </details>
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
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
