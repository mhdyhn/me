import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, BarChart3, CalendarCheck2, CalendarDays, Clock3, Dumbbell, Flame, RefreshCw, Utensils } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { CoachConnection } from '../components/CoachConnection';
import { RouteLoading } from '../components/RouteLoading';
import { usePersonalSyncState } from '../components/PersonalSync';
import { isOfflineBuild } from '../lib/accountScope';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { getAssignedMeta, getWorkoutTemplate, isProgramReadOnly, useAssignedMeta, useAssignedProgramLoadState, useProgram } from '../lib/programStore';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { workoutSessionTemplate } from '../lib/workoutSessionTemplate';
import { getCompletedThisWeek, getCurrentStreak, getNextWorkout } from '../lib/analytics';
import { useMotivationalQuote } from '../lib/motivationalQuotes';
import { faNumber, formatDate } from '../lib/format';

const shortcuts = [
  { to: '/program', label: 'برنامهٔ تمرین', detail: 'جلسه‌ها و روزهای تمرین', icon: CalendarDays },
  { to: '/progress', label: 'مرور پیشرفت', detail: 'سوابق و آمار شخصی', icon: BarChart3 },
  { to: '/nutrition', label: 'دفتر تغذیه', detail: 'وعده‌ها و یادداشت‌ها', icon: Utensils },
  { to: '/exercises', label: 'کتابخانهٔ حرکت‌ها', detail: 'راهنمای اجرای حرکت', icon: Dumbbell },
];

export function Dashboard() {
  const { sessions, loading, refreshing, storageWarning, activeSession } = useGym();
  const { user } = useSession();
  const program = useProgram();
  const assignedProgramLoadState = useAssignedProgramLoadState();
  const assignedMeta = useAssignedMeta();
  const personalSync = usePersonalSyncState();
  const [slowProgram, setSlowProgram] = useState(false);
  useEffect(() => {
    setSlowProgram(false);
    if (assignedProgramLoadState !== 'loading') return;
    const timer = window.setTimeout(() => setSlowProgram(true), 8000);
    return () => window.clearTimeout(timer);
  }, [assignedProgramLoadState]);
  const independent = user?.role === 'student' && (user.coachId === null || user.personalProgramMode === true);
  // The admin's personal programme is independent of the club-management screens.
  const personal = !user || user.role !== 'student' || independent;
  const navigate = useNavigate();

  const quote = useMotivationalQuote();
  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'صبح به‌خیر' : hour < 18 ? 'روز به‌خیر' : 'عصر به‌خیر';
  const nextWorkout = useMemo(() => getNextWorkout(sessions), [sessions, program]);
  const displayedWorkout = activeSession
    ? workoutSessionTemplate(activeSession, getWorkoutTemplate(activeSession.templateId), isProgramReadOnly() ? getAssignedMeta() : null) ?? null
    : nextWorkout;
  const weeklyCount = useMemo(() => getCompletedThisWeek(sessions, now), [sessions, now]);
  const streak = useMemo(() => getCurrentStreak(sessions, now), [sessions, now]);
  const targetCount = useMemo(() => program.filter((workout) => !workout.optional).length, [program]);
  const completedCount = Math.min(weeklyCount, targetCount);
  const weeklyProgress = targetCount > 0 ? (completedCount / targetCount) * 100 : 0;
  const exerciseCount = displayedWorkout?.exercises.length ?? 0;
  const setCount = displayedWorkout?.exercises.reduce((sum, item) => sum + item.prescription.sets, 0) ?? 0;
  const workoutName = activeSession ? displayedWorkout?.name ?? activeSession.name : displayedWorkout?.name ?? '';
  // An untouched local session can be created just by opening the workout screen.
  const sessionHasProgress = Boolean(activeSession && (
    activeSession.exercises.some((exercise) => exercise.sets.length > 0)
    || activeSession.currentExerciseIndex > 0 || activeSession.currentSetIndex > 0 || activeSession.notes?.trim()
  ));
  const untouchedSession = Boolean(activeSession && displayedWorkout && !sessionHasProgress);
  const activeSessions = sessions.filter((session) => session.status === 'active');
  const sessionSyncPending = Boolean(refreshing || (user && !isOfflineBuild && import.meta.env.MODE !== 'test' && !personalSync.lastSyncAt
    && (personalSync.phase === 'idle' || personalSync.phase === 'syncing')));
  const sessionSyncFailed = Boolean(user && !isOfflineBuild && !personalSync.lastSyncAt && personalSync.phase === 'error');
  const sessionSyncConflict = personalSync.conflicts.some((item) => item.kind === 'session');

  const startOrResume = () => {
    if (activeSession) navigate(`/workout/${activeSession.templateId}`);
    else if (nextWorkout) navigate(`/workout/${nextWorkout.id}`);
  };

  if (loading) return <RouteLoading />;
  return (
    <div className="page-stack dashboard-page">
      <section className="welcome-row">
        <div className="welcome-row__identity">
          <span className="welcome-row__avatar" aria-hidden="true">{user?.displayName?.trim().charAt(0) || 'م'}</span>
          <div>
            <p className="eyebrow">{formatDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <h2>{greeting}{user?.displayName ? `، ${user.displayName}` : ''}<span className="accent-dot">.</span></h2>
            <p className="muted"><strong>{quote.title}</strong> {quote.subtitle}</p>
          </div>
        </div>
        <Link className="text-link desktop-only" to="/program">دیدن برنامهٔ هفتگی <ArrowLeft size={15} /></Link>
      </section>

      <div className={`dashboard-grid ${targetCount > 0 ? 'dashboard-grid--home' : 'dashboard-grid--single'}`}>
        {sessionSyncPending ? (
          <section className="dashboard-no-program panel-card" role="status" aria-live="polite">
            <div className="dashboard-program-message">
              <span className="hero-kicker"><span aria-hidden="true" /> وضعیت تمرین</span>
              <h3>در حال بررسی اطلاعات حساب…</h3>
              <p>جلسه‌های این دستگاه و سرور را بررسی می‌کنیم.</p>
            </div>
          </section>
        ) : sessionSyncFailed || sessionSyncConflict || storageWarning ? (
          <section className="dashboard-no-program panel-card" role="alert">
            <EmptyState
              title={sessionSyncConflict ? 'وضعیت تمرین نیاز به بررسی دارد' : storageWarning ? 'وضعیت تمرین در دستگاه نامشخص است' : personal && !activeSession && !displayedWorkout ? 'بررسی برنامهٔ شخصی کامل نشد' : 'بررسی تمرین‌های سرور انجام نشد'}
              detail={sessionSyncConflict ? 'نسخهٔ تمرین در دستگاه و سرور متفاوت است؛ پیش از ادامه هر دو را بررسی کن.' : storageWarning || 'وضعیت جلسهٔ دستگاه‌های دیگر مشخص نیست؛ اطلاعات این دستگاه دست‌نخورده مانده‌اند.'}
              action={<><Link to="/settings" className="button button--primary">بررسی همگام‌سازی <ArrowLeft size={15} /></Link>{personal && <> <Link to="/program" className="button button--secondary">برنامهٔ محلی</Link></>}</>}
            />
          </section>
        ) : activeSessions.length > 1 && activeSession ? (
          <section className="dashboard-no-program panel-card" role="alert">
            <EmptyState
              title="چند جلسهٔ باز پیدا شد"
              detail="ممکن است جلسه‌ها در دستگاه‌های مختلف شروع شده باشند. پیش از ادامه، آن‌ها را بررسی کن؛ ست‌های ثبت‌شده پاک نمی‌شوند."
              action={<Link to={`/workout/${activeSession.templateId}`} className="button button--primary">بررسی جلسه‌ها <ArrowLeft size={15} /></Link>}
            />
          </section>
        ) : displayedWorkout || activeSession ? (
          <section className={`next-workout-card${activeSession && !untouchedSession ? ' next-workout-card--active' : ''}`}>
            <div className="next-workout-card__content">
              <div className="next-workout-card__top">
                <span className="hero-kicker"><span aria-hidden="true" /> {activeSession && !untouchedSession ? 'تمرین ادامه‌دار' : 'جلسهٔ بعدی'}</span>
                <span className="day-chip">{activeSession && !untouchedSession ? 'در حال انجام' : displayedWorkout?.dayLabel ?? 'تمرین'}</span>
              </div>
              <div className="next-workout-card__body">
                <div className="next-workout-card__copy">
                  <p className="workout-focus">{displayedWorkout?.focus ?? 'جلسهٔ تمرینی'}</p>
                  <h3>{workoutName}</h3>
                  {displayedWorkout?.description && <p className="next-workout-description">{displayedWorkout.description}</p>}
                  {activeSession && <p className="muted small-text">{!displayedWorkout ? 'برنامهٔ اصلی جلسه در دسترس نیست؛ وضعیت جلسه و ست‌های ثبت‌شده را بررسی کن.' : untouchedSession ? 'هنوز ستی ثبت نشده؛ با شروع، همین جلسه باز می‌شود.' : 'جلسهٔ ناتمام ذخیره شده است؛ هر وقت آماده‌ای ادامه بده.'}</p>}
                  {user && personalSync.phase === 'offline' && <p className="muted small-text">آفلاین هستی؛ وضعیت تمرین در دستگاه دیگر ممکن است متفاوت باشد.</p>}
                </div>
              </div>
              {displayedWorkout && (
                <div className="workout-meta-row">
                  <span><Dumbbell size={15} /> {faNumber(exerciseCount)} حرکت</span>
                  <span><CalendarCheck2 size={15} /> {faNumber(setCount)} ست کاری</span>
                  <span><Clock3 size={15} /> حدود {faNumber(displayedWorkout.durationMinutes)} دقیقه</span>
                </div>
              )}
              <div className="next-workout-card__footer">
                <button className="button button--primary button--large" onClick={startOrResume}>
                  {activeSession && !untouchedSession ? 'ادامهٔ تمرین' : 'شروع تمرین'} <ArrowLeft size={17} />
                </button>
                <Link to="/program" className="hero-program-link">برنامهٔ من <ArrowLeft size={15} /></Link>
              </div>
            </div>
          </section>
        ) : personal && user && !personalSync.lastSyncAt && (personalSync.phase === 'offline' || personalSync.phase === 'error') ? (
          <section className="dashboard-no-program panel-card">
            <EmptyState
              title="بررسی برنامهٔ شخصی کامل نشد"
              detail="نبود برنامه در سرور هنوز تأیید نشده است؛ وضعیت همگام‌سازی را بررسی کن یا برنامهٔ محلی را باز کن."
              action={<><Link to="/settings" className="button button--primary">بررسی همگام‌سازی <ArrowLeft size={15} /></Link> <Link to="/program" className="button button--secondary">برنامهٔ محلی</Link></>}
            />
          </section>
        ) : user?.role === 'student' && !independent && assignedProgramLoadState !== 'ready' && assignedProgramLoadState !== 'error' ? (
          <section className="dashboard-no-program panel-card" role="status" aria-live="polite">
            <div className="dashboard-program-message">
              <span className="hero-kicker"><span aria-hidden="true" /> برنامهٔ تمرینی</span>
              <h3>در حال دریافت برنامه از مربی…</h3>
              <p className="muted">{slowProgram ? 'ارتباط بیشتر از معمول طول کشیده است. اگر پاسخ نرسد، امکان تلاش دوباره نمایش داده می‌شود.' : 'کمی صبر کن؛ برنامه پس از دریافت نمایش داده می‌شود.'}</p>
            </div>
          </section>
        ) : assignedProgramLoadState === 'error' && user?.role === 'student' && !independent ? (
          <section className="dashboard-no-program panel-card" role="alert">
            <EmptyState
              title="دریافت برنامه انجام نشد"
              detail="ارتباط با سرور برقرار نشد. دوباره تلاش کن؛ تا آن زمان برنامه‌ای را به‌اشتباه خالی نشان نمی‌دهیم."
              action={<button className="button button--primary" type="button" onClick={() => void loadAssignedProgram()}>تلاش دوباره <RefreshCw size={15} /></button>}
            />
          </section>
        ) : !personal && assignedMeta && assignedMeta.priceTomans > 0 && !assignedMeta.isPaid && !assignedMeta.isTestPurchase ? (
          <section className="dashboard-no-program panel-card">
            <EmptyState
              title="برنامهٔ مربی آماده است"
              detail="برای دیدن جزئیات و فعال‌سازی برنامه، صفحهٔ برنامه را باز کن."
              action={<Link to="/program" className="button button--primary">بررسی برنامه <ArrowLeft size={15} /></Link>}
            />
          </section>
        ) : (
          <section className="dashboard-no-program panel-card">
            {personal ? (
              <EmptyState
                title="برنامهٔ خودت را شروع کن"
                detail="یک الگو انتخاب کن یا برنامهٔ شخصی خودت را بساز."
                action={<Link to="/program" className="button button--primary">ساخت برنامهٔ شخصی <ArrowLeft size={15} /></Link>}
              />
            ) : (
              <EmptyState
                title="برنامهٔ تمرینی‌ات هنوز آماده نیست"
                detail="برای دریافت یا تغییر برنامه، از مربی‌ات پیام بگیر."
                action={<Link to="/chat" className="button button--primary">گفتگو با مربی <ArrowLeft size={15} /></Link>}
              />
            )}
          </section>
        )}

        {targetCount > 0 && (
          <section className="weekly-card panel-card" aria-label="پیشرفت تمرین این هفته">
            <div className="weekly-card__header">
              <div className="weekly-card__title">
                <span className="eyebrow">این هفته</span>
                <strong>قدم‌های تو</strong>
              </div>
              <span className="week-streak"><Flame size={15} /> {faNumber(streak)} روز پیاپی</span>
            </div>
            <div className="weekly-card__body">
              <div className="week-progress-ring" role="progressbar" aria-label="پیشرفت تمرین هفتگی" aria-valuemin={0} aria-valuemax={targetCount} aria-valuenow={completedCount} aria-valuetext={`${faNumber(completedCount)} از ${faNumber(targetCount)} جلسه`} style={{ '--weekly-progress': `${weeklyProgress}%` } as CSSProperties}>
                <div aria-hidden="true"><strong>{faNumber(completedCount)}</strong><span>از {faNumber(targetCount)} جلسه</span></div>
              </div>
              <div className="weekly-card__footer">
                <p>{completedCount >= targetCount ? 'هدف هفتگی انجام شد؛ آفرین.' : `برای رسیدن به هدف، ${faNumber(targetCount - completedCount)} جلسه مانده.`}</p>
                <Link to="/progress" className="inline-link">گزارش تمرین‌ها <ArrowLeft size={14} /></Link>
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-title">
        <div className="dashboard-shortcuts__heading">
          <div><span className="eyebrow">همه‌چیز در یک نگاه</span><h3 id="dashboard-shortcuts-title">مسیر تمرین تو</h3></div>
        </div>
        <div className="dashboard-shortcuts__grid">
          {shortcuts.map(({ to, label, detail, icon: Icon }) => (
            <Link key={to} to={to} className="dashboard-shortcut">
              <span className="dashboard-shortcut__icon"><Icon size={20} /></span>
              <span className="dashboard-shortcut__copy"><strong>{label}</strong><small>{detail}</small></span>
              <ArrowLeft size={16} className="dashboard-shortcut__arrow" />
            </Link>
          ))}
        </div>
      </section>
      <CoachConnection />
    </div>
  );
}
