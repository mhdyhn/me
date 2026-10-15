import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarCheck2, Clock3, Dumbbell, Flame, HeartPulse, Plus, Sparkles, Trophy, Weight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useGym } from '../context/GymProvider';
import { getWorkoutTemplate, useProgram } from '../lib/programStore';
import { getCompletedThisWeek, getCurrentStreak, getNextWorkout, getRecentRecord } from '../lib/analytics';
import { calculateMuscleRecovery, calculateReadinessScore, getStoredHealthMetrics } from '../lib/aiHealthEngine';
import { ALL_AI_MODULES, getMyAiSettings, type AiModuleKey } from '../lib/studentAiBiometrics';
import { faNumber, formatDate, kg } from '../lib/format';

export function Dashboard() {
  const { sessions, bodyweights, profile, activeSession } = useGym();
  const program = useProgram();
  const navigate = useNavigate();
  const [enabledModules, setEnabledModules] = useState<AiModuleKey[]>([...ALL_AI_MODULES]);

  useEffect(() => {
    let mounted = true;
    void getMyAiSettings()
      .then((settings) => {
        if (mounted && settings && settings.enabledModules) {
          setEnabledModules(settings.enabledModules);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'صبح به‌خیر' : hour < 18 ? 'روز به‌خیر' : 'عصر به‌خیر';
  const nextWorkout = getNextWorkout(sessions);
  const weeklyCount = getCompletedThisWeek(sessions, now);
  // The weekly target is the number of main days in the account's own programme (the coach's, for students).
  const targetCount = program.filter((workout) => !workout.optional).length;
  const streak = getCurrentStreak(sessions, now);
  const recentPR = getRecentRecord(sessions);
  const latestWeight = bodyweights[0]?.weightKg ?? profile.weightKg;
  const weightIsLogged = Boolean(bodyweights[0]);
  const exerciseCount = nextWorkout?.exercises.length ?? 0;
  const setCount = nextWorkout?.exercises.reduce((sum, item) => sum + item.prescription.sets, 0) ?? 0;
  const activeWorkoutName = activeSession ? getWorkoutTemplate(activeSession.templateId)?.name ?? activeSession.name : '';

  const startOrResume = async () => {
    if (activeSession) {
      navigate(`/workout/${activeSession.templateId}`);
      return;
    }
    if (nextWorkout) navigate(`/workout/${nextWorkout.id}`);
  };

  const recentCompleted = sessions.find((session) => session.status === 'completed');
  const recentWorkoutName = recentCompleted ? getWorkoutTemplate(recentCompleted.templateId)?.name ?? recentCompleted.name : '';

  const healthMetrics = getStoredHealthMetrics();
  const readiness = calculateReadinessScore(healthMetrics, sessions, now);
  const muscleRecoveries = calculateMuscleRecovery(sessions, now);

  return (
    <div className="page-stack dashboard-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{formatDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h2>{greeting}<span className="accent-dot">.</span></h2>
          <p className="muted">یک جلسهٔ متمرکز، یک قدم رو به جلوست. حرکت‌ها را تمیز و پیوسته اجرا کن.</p>
        </div>
        <Link className="text-link desktop-only" to="/program">دیدن برنامهٔ هفتگی <ArrowRight size={15} /></Link>
      </section>

      {activeSession && (
        <section className="active-workout-banner">
          <div className="active-pulse" />
          <div><p className="eyebrow">تمرین در حال انجام</p><strong>{activeWorkoutName}</strong><span> آخرین ست روی این دستگاه ذخیره شده است.</span></div>
          <Link className="button button--small button--primary" to={`/workout/${activeSession.templateId}`}>ادامه <ArrowRight size={15} /></Link>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="next-workout-card">
          <div className="next-workout-card__top">
            <span className="eyebrow">{activeSession ? 'قدم بعدی در برنامه' : 'جلسهٔ بعدی'}</span>
            <span className="day-chip">{nextWorkout?.dayLabel ?? 'تمرین'}</span>
          </div>
          <div className="next-workout-card__body">
            <div className="next-workout-card__copy">
              <p className="workout-focus">{nextWorkout?.focus}</p>
              <h3>{nextWorkout?.name ?? 'اولین جلسه‌ات را بساز'}</h3>
              <p className="next-workout-description">{nextWorkout?.description}</p>
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
            <span><Clock3 size={15} /> حدود {faNumber(nextWorkout?.durationMinutes ?? 0)} دقیقه</span>
          </div>
          <div className="next-workout-card__footer">
            <button className="button button--primary button--large" onClick={() => void startOrResume()}>
              {activeSession ? 'ادامهٔ تمرین' : 'شروع تمرین'} <ArrowRight size={17} />
            </button>
            <span className="quiet-note">عجله‌ای نیست؛ هر وقت آماده‌ای تمرین کن.</span>
          </div>
        </section>

        <section className="weekly-card panel-card">
          <div className="card-topline"><span className="eyebrow">این هفته</span><span className="week-badge">{faNumber(weeklyCount)} / {faNumber(targetCount)}</span></div>
          <h3>حضور پیدا کن، بعد پیشرفت کن.</h3>
          <p className="muted">جلسه‌های اصلی انجام‌شده در این هفته.</p>
          <div className="week-progress" role="progressbar" aria-label="تعداد جلسه‌های اصلی انجام‌شده در این هفته" aria-valuemin={0} aria-valuemax={targetCount} aria-valuenow={Math.min(weeklyCount, targetCount)}>
            {Array.from({ length: targetCount }, (_, index) => <span key={index} className={index < weeklyCount ? 'is-done' : ''} />)}
          </div>
          <div className="week-foot"><span><Flame size={15} /> {faNumber(streak)} روز پیاپی</span><span>{faNumber(Math.min(weeklyCount, targetCount))} از {faNumber(targetCount)}</span></div>
        </section>
      </div>

      {/* AI Health & Recovery Intelligence Widget (Whoop, Oura, Fitbod) */}
      {(enabledModules.includes('recovery') || enabledModules.includes('muscles')) && (
        <section className="dashboard-ai-card">
          <div className="dashboard-ai-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge--success" style={{ borderColor: `${readiness.color}40`, color: readiness.color }}>
                <Sparkles size={13} /> {readiness.levelLabel.split('(')[0]}
              </span>
              <span className="muted text-xs">
                {enabledModules.includes('recovery') ? 'موتور Whoop & Oura' : 'موتور Fitbod'}
              </span>
            </div>
            <Link to="/ai-hub" className="text-link">
              مرکز هوش سلامتی و مفاصل <ArrowRight size={14} />
            </Link>
          </div>

          {enabledModules.includes('recovery') && (
            <div className="dashboard-ai-body">
              <div className="dashboard-ai-score-pill">
                <HeartPulse size={22} style={{ color: readiness.color }} />
                <div>
                  <span className="dashboard-ai-score-num" style={{ color: readiness.color }}>
                    {faNumber(readiness.score)}٪
                  </span>
                  <small className="muted" style={{ display: 'block', fontSize: '11px' }}>نمره آمادگی بدن</small>
                </div>
              </div>
              <p className="dashboard-ai-advice">
                <strong>توصیه مربی هوشمند برای امروز: </strong>
                {readiness.coachRecommendation}
              </p>
            </div>
          )}

          {enabledModules.includes('muscles') && (
            <div className="dashboard-ai-muscles-preview">
              <span className="muted text-xs">وضعیت عضلات (Fitbod):</span>
              {muscleRecoveries.slice(0, 4).map((m) => (
                <span key={m.zoneKey} className="badge badge--neutral text-xs">
                  <span
                    style={{
                      backgroundColor: m.color,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      display: 'inline-block',
                      marginInlineEnd: 4,
                    }}
                  />
                  {m.label}: {faNumber(m.recoveryPercent)}٪
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="dashboard-lower-grid">
        <section className="panel-card records-card">
          <div className="card-topline"><span className="eyebrow">بهترین رکورد اخیر</span><Trophy size={17} className="icon-accent" /></div>
          {recentPR ? (
            <div className="record-highlight">
              <div className="record-number">{kg(recentPR.weightKg)} <span>× {faNumber(recentPR.reps)}</span></div>
              <strong>{recentPR.exerciseName}</strong>
              <span className="muted small-text">بهترین عملکرد ثبت‌شده · {formatDate(recentPR.date, { day: 'numeric', month: 'short' })}</span>
            </div>
          ) : (
            <EmptyState title="اولین رکوردت در انتظارت است" detail="یک جلسه ثبت کن تا عملکرد واقعی‌ات را دنبال کنی." action={<Link to="/progress" className="inline-link">دیدن پیشرفت <ArrowRight size={14} /></Link>} />
          )}
        </section>

        <section className="panel-card bodyweight-card">
          <div className="card-topline"><span className="eyebrow">وزن بدن</span><Weight size={17} className="icon-muted" /></div>
          <div className="bodyweight-big">{kg(latestWeight)}<span className="weight-label">{weightIsLogged ? 'آخرین ثبت' : 'وزن پایهٔ پروفایل'}</span></div>
          <p className="muted small-text">افزایش عضله با دنبال‌کردن روند بهتر پیش می‌رود، نه با یک بار وزن‌کشی.</p>
          <Link to="/progress#bodyweight" className="inline-link">ثبت وزن بدن <Plus size={14} /></Link>
        </section>

        <section className="panel-card next-step-card">
          <div className="card-topline"><span className="eyebrow">پروفایل تمرینی</span><ArrowUpRight size={16} className="icon-muted" /></div>
          <div className="profile-summary"><span className="profile-summary__number">{faNumber(profile.trainingDays)}</span><span><strong>روز اصلی در هفته</strong><small>{profile.primaryGoal}</small></span></div>
          <div className="profile-summary profile-summary--compact"><span className="profile-summary__number">{faNumber(profile.sessionMinutes)}</span><span><strong>دقیقه در دسترس</strong><small>برای هر جلسه · بهتر است بیشتر نشود</small></span></div>
          <Link to="/settings" className="inline-link">مرور پروفایل <ArrowRight size={14} /></Link>
        </section>
      </div>

      <section className="recent-session-section">
        <div className="section-heading">
          <div><p className="eyebrow">تداومت را حفظ کن</p><h2>تمرین‌های اخیر</h2></div>
          <Link className="text-link" to="/progress">دیدن سوابق <ArrowRight size={15} /></Link>
        </div>
        {recentCompleted ? (
          <Link className="recent-session-row" to="/progress">
            <div className="recent-session-icon"><Dumbbell size={17} /></div>
            <div className="recent-session-info"><strong>{recentWorkoutName}</strong><span>{formatDate(recentCompleted.startedAt, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
            <span className="session-status"><span className="status-dot" /> کامل‌شده</span>
            <ArrowRight size={16} className="icon-muted" />
          </Link>
        ) : (
          <div className="recent-session-empty"><span className="subtle-icon"><Dumbbell size={17} /></span><span>هنوز جلسه‌ای ثبت نشده است. بعد از اولین تمرین، سوابقت را اینجا می‌بینی.</span><Link to="/program">دیدن برنامه</Link></div>
        )}
      </section>

      <section className="explore-strip">
        <div><span className="eyebrow">با اطمینان حرکت کن</span><strong>پیش از اولین ست، آماده‌سازی حرکت را یاد بگیر.</strong><small>راهنمای کوتاه، نکته‌های اجرایی و تنظیم وسایل.</small></div>
        <Link to="/exercises" className="button button--secondary">دیدن حرکت‌ها <ArrowRight size={16} /></Link>
      </section>

      {program.length === 0 && <p className="muted">هنوز برنامهٔ تمرینی‌ای در دسترس نیست.</p>}
    </div>
  );
}
