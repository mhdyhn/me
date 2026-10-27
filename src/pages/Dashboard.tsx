import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarCheck2, Clock3, Dumbbell, Flame } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { getWorkoutTemplate, useProgram } from '../lib/programStore';
import { getCompletedThisWeek, getCurrentStreak, getNextWorkout } from '../lib/analytics';
import { useMotivationalQuote } from '../lib/motivationalQuotes';
import { ApiError, api } from '../lib/api';
import type { UserProfile } from '../types';
import { faNumber, formatDate } from '../lib/format';

const profileNeedsSetup = (profile: UserProfile): boolean => !profile.age || !profile.heightCm || !profile.weightKg || !profile.primaryGoal || !profile.trainingDays || !profile.sessionMinutes;

export function Dashboard() {
  const { sessions, profile, loading, saveProfile, activeSession } = useGym();
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const { user } = useSession();
  const [cloudProfileChecked, setCloudProfileChecked] = useState(false);
  const [profileSyncStatus, setProfileSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'disabled' | 'error' | 'not-needed'>('idle');
  const [profileSyncError, setProfileSyncError] = useState('');
  const [syncAttempt, setSyncAttempt] = useState(0);
  const program = useProgram();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user?.role !== 'student' || import.meta.env.MODE === 'offline') {
      setProfileSyncStatus('not-needed');
      setCloudProfileChecked(true);
      return;
    }
    let active = true;
    setCloudProfileChecked(false);
    setProfileSyncStatus('syncing');
    setProfileSyncError('');
    void api<{ stored: { profile: UserProfile; shareWithCoach: boolean } | null }>('GET', '/me/profile')
      .then(async ({ stored }) => {
        if (!active) return;
        if (stored?.shareWithCoach) {
          await saveProfile(stored.profile);
          if (active) setProfileSyncStatus('synced');
        } else if (stored) {
          // Never let an automatic retry undo a deliberate sharing opt-out.
          setProfileSyncStatus('disabled');
        } else if (!profileNeedsSetup(profileRef.current)) {
          // Existing students with a complete local profile are synced automatically too.
          await api('PUT', '/me/profile', { profile: profileRef.current, shareWithCoach: true });
          if (active) setProfileSyncStatus('synced');
        } else {
          setProfileSyncStatus('not-needed');
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setProfileSyncError(caught instanceof ApiError ? caught.message : 'اتصال به سرور برقرار نشد. اینترنت را بررسی کن و دوباره تلاش کن.');
        setProfileSyncStatus('error');
      })
      .finally(() => { if (active) setCloudProfileChecked(true); });
    return () => { active = false; };
  }, [user?.id, user?.role, loading, saveProfile, syncAttempt]);

  const quote = useMotivationalQuote();
  const now = useMemo(() => new Date(), []);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'صبح به‌خیر' : hour < 18 ? 'روز به‌خیر' : 'عصر به‌خیر';
  const nextWorkout = useMemo(() => getNextWorkout(sessions), [sessions]);
  const displayedWorkout = activeSession
    ? getWorkoutTemplate(activeSession.templateId) ?? null
    : nextWorkout;
  const weeklyCount = useMemo(() => getCompletedThisWeek(sessions, now), [sessions, now]);
  // The weekly target is the number of main days in the student's coach-assigned programme.
  const targetCount = useMemo(() => program.filter((workout) => !workout.optional).length, [program]);
  const streak = useMemo(() => getCurrentStreak(sessions, now), [sessions, now]);
  const exerciseCount = displayedWorkout?.exercises.length ?? 0;
  const setCount = displayedWorkout?.exercises.reduce((sum, item) => sum + item.prescription.sets, 0) ?? 0;
  const recentCompleted = useMemo(() => sessions.find((session) => session.status === 'completed'), [sessions]);
  const recentWorkoutName = recentCompleted ? getWorkoutTemplate(recentCompleted.templateId)?.name ?? recentCompleted.name : '';
  const workoutName = activeSession ? displayedWorkout?.name ?? activeSession.name : displayedWorkout?.name ?? '';

  const startOrResume = () => {
    if (activeSession) {
      navigate(`/workout/${activeSession.templateId}`);
    } else if (nextWorkout) {
      navigate(`/workout/${nextWorkout.id}`);
    }
  };

  if (loading || (!cloudProfileChecked && syncAttempt === 0)) return null;
  return (
    <div className="page-stack dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{formatDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2>{greeting}<span className="accent-dot">.</span></h2>
          <p className="muted"><strong>{quote.title}</strong> {quote.subtitle}</p>
        </div>
        <Link className="text-link desktop-only" to="/program">دیدن برنامهٔ هفتگی <ArrowRight size={15} /></Link>
      </section>

      {user?.role === 'student' && profileSyncStatus === 'synced' && (
        <p className="profile-sync-status profile-sync-status--ok" role="status">پروفایل با حساب همگام است و برای مربی فعلی‌ات قابل مشاهده است.</p>
      )}
      {user?.role === 'student' && profileSyncStatus === 'error' && (
        <section className="profile-sync-status profile-sync-status--error" role="alert">
          <div><strong>همگام‌سازی پروفایل انجام نشد.</strong><p>{profileSyncError}</p></div>
          <button className="button button--small button--secondary" type="button" onClick={() => setSyncAttempt((attempt) => attempt + 1)}>تلاش دوباره</button>
        </section>
      )}
      {user?.role === 'student' && syncAttempt > 0 && profileSyncStatus === 'syncing' && (
        <p className="profile-sync-status" role="status">در حال تلاش دوباره برای همگام‌سازی پروفایل…</p>
      )}

      <div className={`dashboard-grid dashboard-grid--focused${targetCount === 0 ? ' dashboard-grid--single' : ''}`}>
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
                {activeSession && <p className="muted small-text">ست‌هایی که ثبت کرده‌ای ذخیره شده‌اند؛ هر وقت آماده‌ای ادامه بده.</p>}
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
        ) : (
          <section className="dashboard-no-program panel-card">
            <EmptyState
              title="برنامهٔ تمرینی‌ات هنوز آماده نیست"
              detail="برای دریافت یا تغییر برنامه، از مربی‌ات پیام بگیر."
              action={<Link to="/chat" className="button button--primary">گفتگو با مربی <ArrowRight size={15} /></Link>}
            />
          </section>
        )}

        {targetCount > 0 && (
          <section className="weekly-card panel-card">
            <div className="card-topline"><span className="eyebrow">این هفته</span><span className="week-badge">{faNumber(Math.min(weeklyCount, targetCount))} / {faNumber(targetCount)}</span></div>
            <h3>{faNumber(weeklyCount)} جلسهٔ اصلی کامل‌شده</h3>
            <p className="muted">یک قدم در هر بار تمرین.</p>
            <div className="week-progress" role="progressbar" aria-label="تعداد جلسه‌های اصلی انجام‌شده در این هفته" aria-valuemin={0} aria-valuemax={targetCount} aria-valuenow={Math.min(weeklyCount, targetCount)}>
              {Array.from({ length: targetCount }, (_, index) => <span key={index} className={index < weeklyCount ? 'is-done' : ''} />)}
            </div>
            <div className="week-foot">
              <span><Flame size={15} /> {faNumber(streak)} روز پیاپی</span>
              <Link to="/progress" className="inline-link">دیدن پیشرفت <ArrowRight size={14} /></Link>
            </div>
          </section>
        )}
      </div>

      {recentCompleted && (
        <Link className="dashboard-recent-session" to="/progress">
          <span className="recent-session-icon"><Dumbbell size={17} /></span>
          <span className="dashboard-recent-session__copy">
            <small>آخرین جلسهٔ کامل‌شده</small>
            <strong>{recentWorkoutName}</strong>
          </span>
          <span className="muted small-text">{formatDate(recentCompleted.startedAt, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <ArrowRight size={16} className="icon-muted" />
        </Link>
      )}
    </div>
  );
}
