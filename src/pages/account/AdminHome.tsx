import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, KeyRound, UserPlus, Users } from 'lucide-react';
import { ApiError, api, type Credentials, type Programme, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
import { PanelPage, CredentialsCard, RequireRole } from './AccountShell';

interface CoachSummary extends PublicUser {
  studentCount: number;
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
  const [openCoachId, setOpenCoachId] = useState<number | null>(null);

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
      {coaches === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {coaches?.length === 0 && <p className="account-muted">هنوز مربی‌ای ساخته نشده است. بالا یکی بسازید.</p>}

      {coaches && coaches.length > 0 && (
        <ul className="student-list">
          {coaches.map((coach) => (
            <li key={coach.id} className="student-row student-row--stacked">
              <div className="student-row__head">
                <div>
                  <strong>{coach.displayName}</strong>
                  <span className="account-muted" dir="ltr">{coach.username}</span>
                  {coach.mustChangePassword && <span className="badge">رمز موقت</span>}
                </div>
                <span className="badge"><Users size={13} /> {coach.studentCount} شاگرد</span>
              </div>
              <div className="student-row__actions">
                <button type="button" className="button button--ghost" onClick={() => setOpenCoachId(openCoachId === coach.id ? null : coach.id)} aria-expanded={openCoachId === coach.id}>
                  {openCoachId === coach.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />} شاگردها
                </button>
                <button type="button" className="button button--ghost" onClick={() => void resetPassword(coach)}>
                  <KeyRound size={16} /> رمز تازه
                </button>
              </div>
              {openCoachId === coach.id && <CoachStudents coachId={coach.id} />}
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  );
}

/** A coach's students, with each student's programme shown read-only. */
function CoachStudents({ coachId }: { coachId: number }) {
  const [students, setStudents] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStudentId, setOpenStudentId] = useState<number | null>(null);

  useEffect(() => {
    api<{ students: PublicUser[] }>('GET', `/coaches/${coachId}/students`)
      .then((result) => setStudents(result.students))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'شاگردها بارگذاری نشد.'));
  }, [coachId]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!students) return <p className="account-muted">در حال بارگذاری…</p>;
  if (students.length === 0) return <p className="account-muted">این مربی هنوز شاگردی ندارد.</p>;

  return (
    <ul className="student-list student-list--nested">
      {students.map((student) => (
        <li key={student.id} className="student-row student-row--stacked">
          <div className="student-row__head">
            <div>
              <strong>{student.displayName}</strong>
              <span className="account-muted" dir="ltr">{student.username}</span>
              {student.mustChangePassword && <span className="badge">رمز موقت</span>}
            </div>
            <button type="button" className="button button--ghost" onClick={() => setOpenStudentId(openStudentId === student.id ? null : student.id)} aria-expanded={openStudentId === student.id}>
              {openStudentId === student.id ? 'بستن برنامه' : 'برنامه'}
            </button>
          </div>
          {openStudentId === student.id && <StudentProgramme coachId={coachId} studentId={student.id} />}
        </li>
      ))}
    </ul>
  );
}

function StudentProgramme({ coachId, studentId }: { coachId: number; studentId: number }) {
  const [program, setProgram] = useState<Programme | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ program: Programme | null }>('GET', `/coaches/${coachId}/students/${studentId}/program`)
      .then((result) => setProgram(result.program))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'برنامه بارگذاری نشد.'));
  }, [coachId, studentId]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (program === undefined) return <p className="account-muted">در حال بارگذاری…</p>;
  if (!program) return <p className="account-muted">برای این شاگرد هنوز برنامه‌ای ثبت نشده است.</p>;

  return (
    <div className="student-programme-readonly">
      <p className="account-muted">{program.title} · فقط خواندنی</p>
      {program.days.map((day, index) => (
        <section key={index} className="student-day">
          <h3>{day.name}</h3>
          <ul className="student-exercises">
            {day.exercises.map((item, itemIndex) => (
              <li key={`${item.exerciseId}-${itemIndex}`}>
                <strong>{item.name}</strong>
                <span className="account-muted">{item.muscle}</span>
                <span className="student-exercises__prescription">{faNumber(item.sets)} ست × <span dir="ltr">{item.reps}</span> تکرار · استراحت {faNumber(item.restSeconds)} ثانیه</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
