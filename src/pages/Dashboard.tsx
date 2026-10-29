import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, Clock3, Dumbbell, Flame, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { CoachConnection } from '../components/CoachConnection';
import { RouteLoading } from '../components/RouteLoading';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { getAssignedMeta, getWorkoutTemplate, isProgramReadOnly, useAssignedProgramLoadState, useProgram } from '../lib/programStore';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { workoutSessionTemplate } from '../lib/workoutSessionTemplate';
import { getCompletedThisWeek, getCurrentStreak, getNextWorkout } from '../lib/analytics';
import { useMotivationalQuote } from '../lib/motivationalQuotes';
import { faNumber, formatDate } from '../lib/format';

export function Dashboard() {
  const { sessions, loading, activeSession } = useGym();
  const { user } = useSession();
  const program = useProgram();
  const assignedProgramLoadState = useAssignedProgramLoadState();
  const [slowProgram, setSlowProgram] = useState(false);
  useEffect(() => {
    setSlowProgram(false);
    if (assignedProgramLoadState !== 'loading') return;
    const timer = window.setTimeout(() => setSlowProgram(true), 8000);
    return () => window.clearTimeout(timer);
  }, [assignedProgramLoadState]);
  const independent = user?.role === 'student' && (user.coachId === null || user.personalProgramMode === true);
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

  const startOrResume = () => {
    if (activeSession) {
      navigate(`/workout/${activeSession.templateId}`);
    } else if (nextWorkout) {
      navigate(`/workout/${nextWorkout.id}`);
    }
  };

  if (loading) return <RouteLoading />;
  return (
    <div className="page-stack dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{formatDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2>{greeting}{user?.displayName ? `، ${user.displayName}` : ''}<span className="accent-dot">.</span></h2>
          <p className="muted"><strong>{quote.title}</strong> {quote.subtitle}</p>
        </div>
        <Link className="text-link desktop-only" to="/program">دیدن برنامهٔ هفتگی <ArrowRight size={15} /></Link>
      </section>

      <div className={`dashboard-grid ${targetCount > 0 ? 'dashboard-grid--home' : 'dashboard-grid--single'}`}>
        {displayedWorkout || activeSession ? (
          <section className={`next-workout-card${activeSession ? ' next-workout-card--active' : ''}`}>
            <div className="next-workout-card__top">
              <span className="eyebrow">{activeSession ? 'تمرین ادامه‌دار' : 'جلسهٔ بعدی'}</span>
              <span className="day-chip">{activeSession ? 'در حال انجام' : displayedWorkout?.dayLabel ?? 'تمرین'}</span>
            </div>
            <div className="next-workout-card__body">
              <div className="next-workout-card__copy">
                <p className="workout-focus">{displayedWorkout?.focus ?? 'جلسهٔ تمرینی'}</p>
                <h3>{workoutName}</h3>
                {displayedWorkout?.description && <p className="next-workout-description">{displayedWorkout.description}</p>}
                {activeSession && <p className="muted small-text">{displayedWorkout ? 'ست‌هایی که ثبت کرده‌ای ذخیره شده‌اند؛ هر وقت آماده‌ای ادامه بده.' : 'برنامهٔ اصلی جلسه در دسترس نیست؛ وضعیت جلسه و ست‌های ثبت‌شده را بررسی کن.'}</p>}
              </div>
              <div className="workout-outline" aria-hidden="true">
                <span className="outline-circle outline-circle--one" />
                <span className="outline-circle outline-circle--two" />
                <Dumbbell size={57} strokeWidth={1.2} />
                <span className="outline-label">میتی / ۰۱</span>
              </div>
            </div>
            <div className="workout-meta-row">
              <span><Dumbbell size={15} /> {faNumber(exerciseCount)} حرکت</span>
              <span><CalendarCheck2 size={15} /> {faNumber(setCount)} ست کاری</span>
              <span><Clock3 size={15} /> حدود {faNumber(displayedWorkout?.durationMinutes ?? 0)} دقیقه</span>
            </div>
            <div className="next-workout-card__footer">
              <button className="button button--primary button--large" onClick={startOrResume}>
                {activeSession ? 'ادامهٔ تمرین' : 'شروع تمرین'} <ArrowRight size={17} />
              </button>
              <span className="quiet-note">عجله‌ای نیست؛ هر وقت آماده‌ای تمرین کن.</span>
            </div>
          </section>
        ) : user?.role === 'student' && !independent && assignedProgramLoadState !== 'ready' && assignedProgramLoadState !== 'error' ? (
          <section className="dashboard-no-program panel-card" role="status" aria-live="polite">
            <div className="dashboard-program-message">
              <span className="eyebrow">برنامهٔ تمرینی</span>
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
        ) : (
          <section className="dashboard-no-program panel-card">
            {independent ? (
              <EmptyState
                title="برنامهٔ خودت را شروع کن"
                detail="بدون مربی هم می‌توانی یک الگو انتخاب کنی یا برنامهٔ شخصی خودت را بسازی."
                action={<Link to="/program" className="button button--primary">ساخت برنامهٔ شخصی <ArrowRight size={15} /></Link>}
              />
            ) : (
              <EmptyState
                title="برنامهٔ تمرینی‌ات هنوز آماده نیست"
                detail="برای دریافت یا تغییر برنامه، از مربی‌ات پیام بگیر."
                action={<Link to="/chat" className="button button--primary">گفتگو با مربی <ArrowRight size={15} /></Link>}
              />
            )}
          </section>
        )}

        {targetCount > 0 && (
          <section className="weekly-card panel-card" aria-label="پیشرفت تمرین این هفته">
            <div className="weekly-card__header">
              <div className="weekly-card__title">
                <span className="eyebrow">این هفته</span>
                <strong>{faNumber(completedCount)} از {faNumber(targetCount)} جلسه</strong>
              </div>
              <span className="week-streak"><Flame size={15} /> {faNumber(streak)} روز پیاپی</span>
            </div>
            <div className="week-progress" role="progressbar" aria-label="پیشرفت تمرین هفتگی" aria-valuemin={0} aria-valuemax={targetCount} aria-valuenow={completedCount}>
              <span className="week-progress__fill" style={{ width: `${weeklyProgress}%` }} />
            </div>
            <div className="weekly-card__footer">
              <p>{completedCount >= targetCount ? 'هدف هفتگی انجام شد؛ آفرین.' : `برای رسیدن به هدف، ${faNumber(targetCount - completedCount)} جلسه مانده.`}</p>
              <Link to="/progress" className="inline-link">گزارش تمرین‌ها <ArrowRight size={14} /></Link>
            </div>
          </section>
        )}
      </div>
      <CoachConnection />
    </div>
  );
}
