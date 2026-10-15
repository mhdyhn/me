import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Apple,
  KeyRound,
  ListChecks,
  MessageCircle,
  Receipt,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
import { PanelPage, CredentialsCard, RequireRole } from './AccountShell';
import { PersonCard } from './PersonCard';

interface CoachSummary extends PublicUser {
  studentCount: number;
  password: string | null;
}

interface ClubStudent extends PublicUser {
  coachName?: string | null;
  password: string | null;
}

/** The admin creates coaches, monitors all students, configures club AI, and audits progress. */
export function AdminHome() {
  return (
    <RequireRole roles={['admin']}>
      <AdminDashboard />
    </RequireRole>
  );
}

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'coaches' | 'students'>('coaches');
  const [coaches, setCoaches] = useState<CoachSummary[] | null>(null);
  const [students, setStudents] = useState<ClubStudent[] | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<number | 'all'>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function loadCoaches() {
    try {
      const result = await api<{ coaches: CoachSummary[] }>('GET', '/coaches');
      setCoaches(result.coaches);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'فهرست مربی‌ها بارگذاری نشد.');
    }
  }

  async function loadStudents() {
    try {
      const result = await api<{ students: ClubStudent[] }>('GET', '/students');
      setStudents(result.students);
    } catch (caught) {
      console.warn('Could not load club students:', caught);
    }
  }

  useEffect(() => {
    void loadCoaches();
    void loadStudents();
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

  async function resetStudentPassword(student: PublicUser) {
    if (!window.confirm(`رمز شاگرد ${student.displayName} دوباره ساخته شود؟`)) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/students/${student.id}/reset-password`, {});
      setCredentials({ user: student, username: result.username, password: result.password });
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'رمز شاگرد ساخته نشد.');
    }
  }

  async function deleteCoach(coach: CoachSummary) {
    if (!window.confirm(`مربی ${coach.displayName} حذف شود؟ این کار برگشت ندارد.`)) return;
    try {
      await api('DELETE', `/coaches/${coach.id}`, {});
      await loadCoaches();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'مربی حذف نشد.');
    }
  }

  async function deleteStudent(student: PublicUser) {
    if (!window.confirm(`شاگرد ${student.displayName} حذف شود؟ این کار برگشت ندارد.`)) return;
    try {
      await api('DELETE', `/students/${student.id}`, {});
      await loadStudents();
      await loadCoaches();
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'شاگرد حذف نشد.');
    }
  }

  const totalStudents = coaches?.reduce((sum, c) => sum + (c.studentCount || 0), 0) ?? (students?.length ?? 0);

  const filteredStudents = (students ?? []).filter((s) => {
    if (selectedCoachId !== 'all' && s.coachId !== selectedCoachId) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.trim().toLowerCase();
      return s.displayName.toLowerCase().includes(q) || s.username.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <PanelPage title="مدیریت جامع باشگاه و هوش مصنوعی">
      {/* Club Overview & AI Activity Banner */}
      <div className="admin-overview-card">
        <div className="admin-overview-stats">
          <div className="admin-stat-item" onClick={() => setActiveTab('coaches')} style={{ cursor: 'pointer' }}>
            <span className="admin-stat-num">{faNumber(coaches?.length ?? 0)}</span>
            <span className="admin-stat-label">مربیان فعال</span>
          </div>
          <div className="admin-stat-item" onClick={() => setActiveTab('students')} style={{ cursor: 'pointer' }}>
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
            <Sparkles size={14} /> مرکز هوش سلامتی
          </Link>
          <Link to="/coach/admin/transactions" className="button button--small button--ghost">
            <Receipt size={14} /> مالی و درآمدها
          </Link>
        </div>
      </div>

      {/* Admin Tab Switcher */}
      <div className="ai-tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'coaches'}
          className={`ai-tab-button ${activeTab === 'coaches' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('coaches')}
        >
          <Users size={16} />
          <span>مدیریت مربیان</span>
          <span className="ai-tab-badge">{faNumber(coaches?.length ?? 0)}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'students'}
          className={`ai-tab-button ${activeTab === 'students' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          <Activity size={16} />
          <span>شاگردان، بیومتریک و عیب‌یابی</span>
          <span className="ai-tab-badge">{faNumber(totalStudents)}</span>
        </button>
      </div>

      {credentials && (
        <CredentialsCard
          credentials={credentials}
          onDone={() => {
            setCredentials(null);
            void loadCoaches();
            void loadStudents();
          }}
        />
      )}

      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {/* ================= TAB 1: COACHES MANAGEMENT ================= */}
      {activeTab === 'coaches' && (
        <>
          {!credentials && (
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
                    badges={<span className="badge"><Users size={13} /> {faNumber(coach.studentCount)} شاگرد</span>}
                    actions={
                      <>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => {
                            setSelectedCoachId(coach.id);
                            setActiveTab('students');
                          }}
                        >
                          <Users size={15} /> شاگردان ({faNumber(coach.studentCount)})
                        </button>
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
        </>
      )}

      {/* ================= TAB 2: CLUB STUDENTS, BIOMETRICS & DIAGNOSTIC ================= */}
      {activeTab === 'students' && (
        <section>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ flex: '1 1 200px' }}>
              <div className="login-input" style={{ width: '100%' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="جستجوی نام یا نام‌کاربری شاگرد..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted text-xs">فیلتر مربی:</span>
              <button
                type="button"
                className={`button button--small ${selectedCoachId === 'all' ? 'button--primary' : 'button--ghost'}`}
                onClick={() => setSelectedCoachId('all')}
              >
                همه ({faNumber(students?.length ?? 0)})
              </button>
              {(coaches ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`button button--small ${selectedCoachId === c.id ? 'button--primary' : 'button--ghost'}`}
                  onClick={() => setSelectedCoachId(c.id)}
                >
                  {c.displayName} ({faNumber(c.studentCount)})
                </button>
              ))}
            </div>
          </div>

          {filteredStudents.length === 0 ? (
            <p className="account-muted">هیچ شاگردی مطابق این فیلتر یافت نشد.</p>
          ) : (
            <ul className="person-card-grid">
              {filteredStudents.map((student) => (
                <li key={student.id}>
                  <PersonCard
                    name={student.displayName}
                    username={student.username}
                    password={student.password}
                    mustChangePassword={student.mustChangePassword}
                    roleLabel="شاگرد"
                    badges={
                      student.coachName ? (
                        <span className="badge badge--neutral">مربی: {student.coachName}</span>
                      ) : undefined
                    }
                    actions={
                      <>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/ai`}>
                          <Sparkles size={16} /> هوش و پایش
                        </Link>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/progress`}>
                          <TrendingUp size={16} /> پیشرفت
                        </Link>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/program`}>
                          <ListChecks size={16} /> برنامه
                        </Link>
                        <Link className="button button--ghost" to={`/coach/students/${student.id}/nutrition`}>
                          <Apple size={16} /> تغذیه
                        </Link>
                        <button type="button" className="button button--ghost" onClick={() => void resetStudentPassword(student)}>
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
        </section>
      )}
    </PanelPage>
  );
}
