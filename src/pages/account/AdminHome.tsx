import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle, ChevronDown, ChevronUp, KeyRound, MessageCircle, Receipt, Sparkles, Trash2, UserPlus, Users } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
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
  const [expandedCoachIds, setExpandedCoachIds] = useState<Set<number>>(() => new Set());
  const [coachStudents, setCoachStudents] = useState<Record<number, PublicUser[]>>({});
  const [loadingCoachStudents, setLoadingCoachStudents] = useState<Record<number, boolean>>({});

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
      void load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'مربی ساخته نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCoachActive(coach: CoachSummary) {
    const nextActive = coach.isActive === false;
    const ok = await confirmModal({
      title: nextActive ? 'فعال‌سازی مربی' : 'غیرفعال‌سازی مربی',
      message: nextActive
        ? `مربی «${coach.displayName}» دوباره فعال شود؟ پس از فعال‌سازی امکان ورود به برنامه را خواهد داشت.`
        : `مربی «${coach.displayName}» غیرفعال شود؟ حساب مربی مسدود شده و از سیستم خارج می‌شود.`,
      confirmText: nextActive ? 'فعال‌سازی' : 'غیرفعال‌سازی',
      cancelText: 'انصراف',
      variant: nextActive ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      await api('PUT', `/coaches/${coach.id}/active`, { active: nextActive });
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'تغییر وضعیت فعال‌سازی مربی انجام نشد.');
    }
  }

  async function fetchCoachStudents(coachId: number) {
    setLoadingCoachStudents((prev) => ({ ...prev, [coachId]: true }));
    try {
      const res = await api<{ coachName: string; students: PublicUser[] }>('GET', `/admin/coaches/${coachId}/students`);
      setCoachStudents((prev) => ({ ...prev, [coachId]: res.students }));
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'بارگذاری شاگردان مربی انجام نشد.');
    } finally {
      setLoadingCoachStudents((prev) => ({ ...prev, [coachId]: false }));
    }
  }

  async function toggleExpandCoachStudents(coachId: number) {
    setExpandedCoachIds((prev) => {
      const next = new Set(prev);
      if (next.has(coachId)) {
        next.delete(coachId);
      } else {
        next.add(coachId);
        if (!coachStudents[coachId]) {
          void fetchCoachStudents(coachId);
        }
      }
      return next;
    });
  }

  async function toggleStudentActiveFromAdmin(coachId: number, student: PublicUser) {
    const nextActive = student.isActive === false;
    const ok = await confirmModal({
      title: nextActive ? 'فعال‌سازی شاگرد' : 'غیرفعال‌سازی شاگرد',
      message: nextActive
        ? `شاگرد «${student.displayName}» دوباره فعال شود؟`
        : `شاگرد «${student.displayName}» غیرفعال شود؟ حساب شاگرد مسدود شده و از سیستم خارج می‌شود.`,
      confirmText: nextActive ? 'فعال‌سازی' : 'غیرفعال‌سازی',
      cancelText: 'انصراف',
      variant: nextActive ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      await api('PUT', `/students/${student.id}/active`, { active: nextActive });
      await fetchCoachStudents(coachId);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'تغییر وضعیت فعال‌سازی شاگرد انجام نشد.');
    }
  }

  async function resetPassword(coach: PublicUser) {
    const ok = await confirmModal({
      title: 'ساخت مجدد رمز عبور مربی',
      message: `رمز جدید برای «${coach.displayName}» دوباره ساخته شود؟ با رمز قبلی دیگر نمی‌تواند وارد شود.`,
      confirmText: 'ساخت رمز جدید',
      cancelText: 'انصراف',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/coaches/${coach.id}/reset-password`, {});
      setCredentials({ user: coach, username: result.username, password: result.password });
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'رمز ساخته نشد.');
    }
  }

  async function deleteCoach(coach: CoachSummary) {
    const ok = await confirmModal({
      title: 'حذف مربی',
      message: `مربی «${coach.displayName}» حذف شود؟ این کار برگشت ندارد.`,
      confirmText: 'حذف مربی',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api('DELETE', `/coaches/${coach.id}`, {});
      await load();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'مربی حذف نشد.');
    }
  }

  const totalStudents = useMemo(() => coaches?.reduce((sum, c) => sum + (c.studentCount || 0), 0) ?? 0, [coaches]);

  return (
    <PanelPage title="مدیریت مربی‌ها و باشگاه">
      {/* Club Overview & AI Activity Banner */}
      <div className="admin-overview-card">
        <div className="admin-overview-stats">
          <div className="admin-stat-item">
            <span className="admin-stat-num">{faNumber(coaches?.length ?? 0)}</span>
            <span className="admin-stat-label">مربیان فعال</span>
          </div>
          <div className="admin-stat-item">
            <span className="admin-stat-num">{faNumber(totalStudents)}</span>
            <span className="admin-stat-label">کل شاگردان باشگاه</span>
          </div>
          <div className="admin-stat-item admin-stat-ai">
            <span className="badge badge--success">
              <Sparkles size={12} /> اکوسیستم AI هوشمند
            </span>
            <span className="admin-stat-label">Whoop · Fitbod · Noom · Hinge فعال</span>
          </div>
        </div>

        <div className="admin-overview-actions">
          <Link to="/ai-hub" className="button button--small button--secondary">
            <Sparkles size={14} /> داشبورد هوش سلامتی
          </Link>
          <Link to="/coach/admin/transactions" className="button button--small button--ghost">
            <Receipt size={14} /> تراکنش‌ها و درآمدها
          </Link>
        </div>
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
                isActive={coach.isActive !== false}
                badges={<span className="badge"><Users size={13} /> {faNumber(coach.studentCount)} شاگرد</span>}
                actions={
                  <>
                    <Link className="button button--ghost" to={`/coach/coaches/${coach.id}/chat`}>
                      <MessageCircle size={16} /> گفتگو
                    </Link>
                    <button
                      type="button"
                      className={`button ${coach.isActive === false ? 'button--primary' : 'button--ghost'}`}
                      onClick={() => void toggleCoachActive(coach)}
                      title={coach.isActive === false ? 'فعال‌سازی مجدد مربی' : 'غیرفعال‌سازی موقت مربی'}
                    >
                      {coach.isActive === false ? <CheckCircle size={16} /> : <Ban size={16} />}
                      {coach.isActive === false ? 'فعال‌سازی مربی' : 'غیرفعال‌سازی مربی'}
                    </button>
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
              >
                {/* Section for coach's students */}
                <div className="person-card__students-box">
                  <div className="person-card__students-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={15} /> شاگردان این مربی ({faNumber(coach.studentCount)})
                    </span>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => void toggleExpandCoachStudents(coach.id)}
                      style={{ height: 28, fontSize: 12, padding: '2px 10px' }}
                    >
                      {expandedCoachIds.has(coach.id) ? (
                        <><ChevronUp size={14} /> بستن</>
                      ) : (
                        <><ChevronDown size={14} /> مشاهده شاگردان</>
                      )}
                    </button>
                  </div>

                  {expandedCoachIds.has(coach.id) && (
                    <div className="coach-students-content">
                      {loadingCoachStudents[coach.id] && (
                        <p className="account-muted" style={{ fontSize: 12, margin: '8px 0' }}>در حال بارگذاری شاگردان…</p>
                      )}
                      {!loadingCoachStudents[coach.id] && (!coachStudents[coach.id] || coachStudents[coach.id]?.length === 0) && (
                        <p className="account-muted" style={{ fontSize: 12, margin: '8px 0' }}>این مربی هنوز شاگردی ندارد.</p>
                      )}
                      {coachStudents[coach.id]?.map((student) => (
                        <div key={student.id} className="coach-student-item">
                          <div className="coach-student-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="coach-student-name">{student.displayName}</span>
                              <span
                                className={student.isActive === false ? 'badge badge--danger' : 'badge badge--success'}
                                style={{ fontSize: 11, padding: '1px 6px', margin: 0 }}
                              >
                                {student.isActive === false ? 'غیرفعال' : 'فعال'}
                              </span>
                            </div>
                            <div className="coach-student-meta">
                              <span dir="ltr">@{student.username}</span>
                            </div>
                          </div>
                          <div className="coach-student-actions">
                            <Link
                              to={`/coach/students/${student.id}/program`}
                              className="button button--ghost button--small"
                              style={{ height: 28, fontSize: 11, padding: '2px 8px' }}
                              title="مشاهده برنامه شاگرد"
                            >
                              برنامه
                            </Link>
                            <button
                              type="button"
                              className={`button button--small ${student.isActive === false ? 'button--primary' : 'button--ghost'}`}
                              style={{ height: 28, fontSize: 11, padding: '2px 8px' }}
                              onClick={() => void toggleStudentActiveFromAdmin(coach.id, student)}
                              title={student.isActive === false ? 'فعال‌سازی شاگرد' : 'غیرفعال‌سازی شاگرد'}
                            >
                              {student.isActive === false ? <CheckCircle size={13} /> : <Ban size={13} />}
                              {student.isActive === false ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </PersonCard>
            </li>
          ))}
        </ul>
      )}
    </PanelPage>
  );
}
