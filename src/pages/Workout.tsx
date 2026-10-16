import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Dumbbell, Info, Minus, Pause, Play, Plus, Trash2, Trophy } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { useGym } from '../context/GymProvider';
import { exerciseById } from '../data/exercises';
import { exerciseFigureSrc, hasExerciseFigure, type FigureState } from '../data/exerciseFigures';
import { getWorkoutTemplate, programExerciseName, useProgram } from '../lib/programStore';
import { getLastExercisePerformance, getRecentRecord, getSessionTotals } from '../lib/analytics';
import { faDigits, faNumber, formatDate, formatDuration, kg } from '../lib/format';
import type { LoggedSet, RestTimerState, WorkoutSession } from '../types';

const rirValue = (label: string) => Number.parseInt(label, 10) || 2;
const timerLabel = (total: number) => faDigits(`${String(Math.floor(Math.max(0, total) / 60)).padStart(2, '0')}:${String(Math.max(0, total) % 60).padStart(2, '0')}`);

export function Workout() {
  const { templateId = '' } = useParams();
  const template = getWorkoutTemplate(templateId);
  const navigate = useNavigate();
  const { sessions, loading, activeSession, startWorkout, saveSession, completeActiveSession, deleteSession } = useGym();
  useProgram();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkoutSession | null>(null);
  const [weightValue, setWeightValue] = useState('');
  const [repsValue, setRepsValue] = useState('');
  const [rirInput, setRirInput] = useState('2');
  const [setNote, setSetNote] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [now, setNow] = useState(Date.now());
  const [formError, setFormError] = useState('');
  const [previewFrame, setPreviewFrame] = useState<FigureState>('start');

  useEffect(() => {
    if (!template || loading) return;
    if (activeSession) {
      setSessionId(activeSession.id);
      return;
    }
    void startWorkout(template.id).then((started) => { if (started) setSessionId(started.id); });
  }, [template, loading, activeSession?.id, startWorkout]);

  const session = summary ?? (sessionId ? sessions.find((item) => item.id === sessionId) ?? null : activeSession);
  const activeTemplate = session ? getWorkoutTemplate(session.templateId) : template;
  const currentExerciseIndex = session?.currentExerciseIndex ?? 0;
  const currentWorkoutExercise = activeTemplate?.exercises[currentExerciseIndex];
  const exercise = currentWorkoutExercise ? exerciseById(currentWorkoutExercise.exerciseId) : undefined;
  const prescription = currentWorkoutExercise?.prescription;
  const sessionExercise = session?.exercises[currentExerciseIndex];
  const setNumber = (session?.currentSetIndex ?? 0) + 1;
  const loggedSet = sessionExercise?.sets.find((set) => set.setNumber === setNumber);
  const previous = currentWorkoutExercise && session ? getLastExercisePerformance(sessions, currentWorkoutExercise.exerciseId, session.id) : null;
  const plannedSetCount = activeTemplate?.exercises.reduce((total, item) => total + item.prescription.sets, 0) ?? 0;
  const loggedSetCount = session?.exercises.reduce((total, item) => total + item.sets.length, 0) ?? 0;
  const completedExercises = session?.exercises.filter((item) => item.sets.length > 0).length ?? 0;
  const isFinalSet = Boolean(activeTemplate && prescription && currentExerciseIndex === activeTemplate.exercises.length - 1 && setNumber === prescription.sets);
  const isDifferentActiveSession = Boolean(activeSession && activeSession.templateId !== templateId);

  const remainingSeconds = useMemo(() => {
    const timer = session?.restTimer;
    if (!timer) return 0;
    if (timer.pausedRemainingSeconds !== null) return Math.max(0, timer.pausedRemainingSeconds);
    if (timer.endsAt !== null) return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
    return 0;
  }, [session?.restTimer, now]);
  const timerStarted = Boolean(session?.restTimer);

  useEffect(() => {
    if (!session?.restTimer || session.restTimer.pausedRemainingSeconds !== null || session.restTimer.endsAt === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [session?.id, session?.restTimer?.endsAt, session?.restTimer?.pausedRemainingSeconds]);

  useEffect(() => {
    if (!session || !prescription || !currentWorkoutExercise || summary) return;
    const priorSameSession = session.exercises[currentExerciseIndex]?.sets.at(-1);
    const lastLogged = loggedSet;
    const previousWeight = previous?.sets[0]?.weightKg;
    setWeightValue(lastLogged ? String(lastLogged.weightKg) : priorSameSession ? String(priorSameSession.weightKg) : previousWeight !== undefined ? String(previousWeight) : '');
    setRepsValue(lastLogged ? String(lastLogged.reps) : priorSameSession ? String(prescription.minReps) : String(prescription.minReps));
    setRirInput(lastLogged ? String(lastLogged.rir) : String(rirValue(prescription.targetRirLabel)));
    setSetNote(lastLogged?.notes ?? '');
    setFormError('');
  }, [session?.id, currentExerciseIndex, session?.currentSetIndex, currentWorkoutExercise?.exerciseId, summary]);

  useEffect(() => { setNotesDraft(session?.notes ?? ''); }, [session?.id]);

  if (!template) {
    return <EmptyState title="جلسه پیدا نشد" detail="این جلسه در برنامهٔ تمرینی فعلی نیست." action={<Link to="/program" className="button button--secondary">بازگشت به برنامه</Link>} />;
  }

  if (loading || (!session && !isDifferentActiveSession)) {
    return <div className="workout-loading"><span className="loader-dot" /><p>در حال آماده‌سازی جلسه…</p></div>;
  }

  if (isDifferentActiveSession && activeSession) {
    const prevWorkoutName = getWorkoutTemplate(activeSession.templateId)?.name ?? activeSession.name;
    return (
      <div className="workout-conflict panel-card">
        <span className="eyebrow">جلسهٔ دیگری در حال انجام است</span>
        <h2>تمرین روز قبل هنوز پایان نیافته است.</h2>
        <p>
          جلسهٔ <strong>{prevWorkoutName}</strong> همچنان باز است. شما می‌توانید این جلسهٔ جدید را آغاز کنید، جلسهٔ قبلی را به اتمام برسانید، یا آن را لغو کنید:
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button
            type="button"
            className="button button--primary"
            onClick={async () => {
              await completeActiveSession(activeSession.id);
              void startWorkout(template.id).then((started) => { if (started) setSessionId(started.id); });
            }}
          >
            <CheckCircle2 size={16} /> اتمام و ثبت جلسهٔ قبلی و شروع این روز
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={async () => {
              if (window.confirm(`آیا جلسهٔ قبلی (${prevWorkoutName}) لغو شود و تمرین امروز آغاز گردد؟`)) {
                await deleteSession(activeSession.id);
                void startWorkout(template.id).then((started) => { if (started) setSessionId(started.id); });
              }
            }}
          >
            <Trash2 size={16} /> لغو جلسهٔ قبلی و شروع این روز
          </button>
          <Link className="button button--ghost" to={`/workout/${activeSession.templateId}`}>
            ادامهٔ جلسهٔ قبلی ({prevWorkoutName}) <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  if (!session || !activeTemplate) return null;

  if (summary || session.status === 'completed') {
    const completed = summary ?? session;
    const totals = getSessionTotals(completed);
    const latestRecord = getRecentRecord([...sessions, completed]);
    const setCount = totals.setCount;
    const recordIsFromThisSession = latestRecord?.sessionId === completed.id;
    return (
      <div className="page-stack workout-summary-page">
        <div className="summary-celebration"><span className="summary-check"><Check size={27} /></span><span className="eyebrow">جلسه ذخیره شد</span><h2>تمرین کامل شد<span className="accent-dot">.</span></h2><p>برای تمرین وقت گذاشتی؛ جلسهٔ بعد بر پایهٔ همین داده‌ها پیش می‌رود.</p></div>
        <div className="summary-stat-grid">
          <div className="summary-stat panel-card"><span>حرکت‌ها</span><strong>{faNumber(totals.exerciseCount)}</strong><small>ثبت‌شده</small></div>
          <div className="summary-stat panel-card"><span>ست‌های کاری</span><strong>{faNumber(setCount)}</strong><small>انجام‌شده</small></div>
          <div className="summary-stat panel-card"><span>مجموع تکرارها</span><strong>{faNumber(totals.repCount)}</strong><small>تکرار ثبت‌شده</small></div>
          <div className="summary-stat panel-card"><span>زمان</span><strong>{formatDuration(totals.durationSeconds)}</strong><small>مدت جلسه</small></div>
        </div>
        <div className="workout-summary-grid">
          <section className="panel-card summary-breakdown"><div className="card-topline"><span className="eyebrow">خلاصهٔ جلسه</span><Dumbbell size={16} className="icon-accent" /></div><h3>{getWorkoutTemplate(completed.templateId)?.name ?? completed.name}</h3><p className="muted">{formatDate(completed.startedAt, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {completed.exercises.filter((item) => item.sets.length).map((item) => <div className="summary-exercise-row" key={item.exerciseId}><div><strong>{programExerciseName(item.exerciseId) ?? exerciseById(item.exerciseId)?.name ?? item.exerciseId}</strong><small>{faNumber(item.sets.length)} ست · {faNumber(item.sets.reduce((sum, set) => sum + set.reps, 0))} تکرار</small></div><span>{kg(item.sets.reduce((max, set) => Math.max(max, set.weightKg), 0))} بهترین ست</span></div>)}
            <div className="volume-callout"><span>حجم کل تمرین</span><strong>{faNumber(Math.round(totals.volumeKg))} <small>کیلوگرم × تکرار</small></strong></div>
          </section>
          <section className="panel-card summary-notes"><div className="card-topline"><span className="eyebrow">یادداشت‌های جلسه</span><Info size={16} className="icon-muted" /></div><label htmlFor="workout-notes">نکته‌ای هست که بخواهی یادت بماند؟</label><textarea id="workout-notes" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} onBlur={() => void saveSession({ ...completed, notes: notesDraft })} placeholder="انرژی، نکتهٔ فرم حرکت یا تنظیم وسیله…" rows={5} /><span className="field-hint">همراه این تمرین ذخیره می‌شود.</span>
            {recordIsFromThisSession && latestRecord && <div className="summary-pr"><Trophy size={18} /><div><span className="eyebrow">ست برتر جدید</span><strong>{latestRecord.exerciseName} · {kg(latestRecord.weightKg)} × {faNumber(latestRecord.reps)}</strong></div></div>}
          </section>
        </div>
        <div className="summary-actions"><Link to="/progress" className="button button--secondary">دیدن پیشرفت <ArrowRight size={16} /></Link><Link to="/" className="button button--primary">بازگشت به صفحهٔ اصلی <ArrowRight size={16} /></Link></div>
      </div>
    );
  }

  if (!currentWorkoutExercise || !prescription || !sessionExercise) return <EmptyState title="این جلسه به بررسی نیاز دارد" detail="بارگذاری یکی از حرکت‌های این جلسه ممکن نشد. ست‌های ذخیره‌شده همچنان در سوابق پیشرفت در دسترس‌اند." action={<Link to="/program" className="button button--secondary">بازگشت به برنامه</Link>} />;

  const goToNextStep = async () => {
    if (!session || !activeTemplate || !prescription) return;
    const nextSet = session.currentSetIndex + 1;
    const sameExerciseHasMore = nextSet < prescription.sets;
    const isLastExercise = currentExerciseIndex >= activeTemplate.exercises.length - 1;

    if (isFinalSet || (isLastExercise && !sameExerciseHasMore)) {
      const completed: WorkoutSession = { ...session, status: 'completed', completedAt: new Date().toISOString(), restTimer: undefined, notes: notesDraft };
      setSummary(completed);
      await saveSession(completed);
      return;
    }
    const updated: WorkoutSession = {
      ...session,
      currentExerciseIndex: sameExerciseHasMore ? session.currentExerciseIndex : session.currentExerciseIndex + 1,
      currentSetIndex: sameExerciseHasMore ? nextSet : 0,
      restTimer: undefined,
      notes: notesDraft,
    };
    await saveSession(updated);
    setNow(Date.now());
  };

  const handleFinishWorkout = async () => {
    if (!session) return;
    const hasAnySets = session.exercises.some((e) => e.sets.length > 0);
    if (!hasAnySets) {
      if (window.confirm('هنوز هیچ ستی در این جلسه ثبت نکرده‌اید. مایلید بدون ثبت تمرین خارج شوید؟')) {
        navigate('/');
      }
      return;
    }
    const confirmed = window.confirm('آیا تمرین امروز شما به پایان رسیده است؟ جلسه به‌عنوان «کامل‌شده» ذخیره می‌شود و در نمودار پیشرفت اعمال خواهد شد.');
    if (!confirmed) return;
    const completed: WorkoutSession = {
      ...session,
      status: 'completed',
      completedAt: new Date().toISOString(),
      restTimer: undefined,
      notes: notesDraft,
    };
    setSummary(completed);
    await saveSession(completed);
  };

  const handleExitClick = async () => {
    if (!session) {
      navigate('/');
      return;
    }
    const hasAnySets = session.exercises.some((e) => e.sets.length > 0);
    if (!hasAnySets) {
      const discard = window.confirm('هنوز هیچ ستی برای این جلسه ثبت نشده است.\n\n• برای لغو و حذف این جلسه «تأیید / OK» را بزنید.\n• برای ذخیره پیش‌نویس بدون تغییر «انصراف / Cancel» را بزنید.');
      if (discard) {
        await deleteSession(session.id);
      }
      navigate('/');
      return;
    }
    const choice = window.confirm(
      'تمرین شما ثبت شده است.\n\n• برای اتمام قطعی جلسه و ثبت نهایی در پیشرفت و آمار: «تأیید / OK» را بزنید.\n• برای ذخیره موقت (ادامه در فرصتی دیگر): «انصراف / Cancel» را بزنید.'
    );
    if (choice) {
      const completed: WorkoutSession = {
        ...session,
        status: 'completed',
        completedAt: new Date().toISOString(),
        restTimer: undefined,
        notes: notesDraft,
      };
      setSummary(completed);
      await saveSession(completed);
    } else {
      navigate('/');
    }
  };

  const handleLogSet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !prescription) return;
    const weight = Number(weightValue);
    const reps = Number(repsValue);
    const rir = Number(rirInput);
    if (!weightValue.trim() || !Number.isFinite(weight) || weight < 0) { setFormError('وزنهٔ استفاده‌شده را به کیلوگرم وارد کن. برای ست فقط با وزن بدن، عدد ۰ را بنویس.'); return; }
    if (!Number.isInteger(reps) || reps < 1 || reps > 100) { setFormError('تعداد تکرار را عددی بین ۱ تا ۱۰۰ وارد کن.'); return; }
    if (!Number.isInteger(rir) || rir < 0 || rir > 5) { setFormError('مقدار تکرار در ذخیره را بین ۰ تا ۵ انتخاب کن.'); return; }
    const currentExercise = session.exercises[currentExerciseIndex];
    if (!currentExercise) { setFormError('این حرکت در جلسه پیدا نشد.'); return; }
    const logged: LoggedSet = { setNumber, weightKg: weight, reps, rir, notes: setNote.trim() || undefined, doneAt: new Date().toISOString() };
    const updatedExercises = [...session.exercises];
    updatedExercises[currentExerciseIndex] = {
      ...currentExercise,
      sets: [...currentExercise.sets.filter((set) => set.setNumber !== setNumber), logged].sort((a, b) => a.setNumber - b.setNumber),
    };
    await saveSession({
      ...session,
      exercises: updatedExercises,
      restTimer: { endsAt: Date.now() + prescription.restSeconds * 1000, pausedRemainingSeconds: null },
      notes: notesDraft,
    });
    setNow(Date.now());
    setFormError('');
  };

  const updateTimer = (timer: RestTimerState | undefined) => {
    if (!session) return;
    void saveSession({ ...session, restTimer: timer });
    setNow(Date.now());
  };

  const togglePause = () => {
    const timer = session.restTimer;
    if (!timer) return;
    if (timer.pausedRemainingSeconds !== null) {
      updateTimer({ endsAt: Date.now() + timer.pausedRemainingSeconds * 1000, pausedRemainingSeconds: null });
    } else {
      updateTimer({ endsAt: null, pausedRemainingSeconds: remainingSeconds });
    }
  };

  const adjustTimer = (delta: number) => {
    const timer = session.restTimer;
    if (!timer) return;
    if (timer.pausedRemainingSeconds !== null) updateTimer({ endsAt: null, pausedRemainingSeconds: Math.max(0, timer.pausedRemainingSeconds + delta) });
    else updateTimer({ endsAt: Math.max(Date.now(), (timer.endsAt ?? Date.now()) + delta * 1000), pausedRemainingSeconds: null });
  };

  const skipRest = () => updateTimer(undefined);
  const progressPercent = plannedSetCount ? Math.round((loggedSetCount / plannedSetCount) * 100) : 0;
  const suggestedReference = exercise?.referenceWeightKg;

  return (
    <div className="workout-mode">
      <div className="workout-topline">
        <Link to="/program" className="back-link"><ArrowLeft size={15} /> برنامه</Link>
        <span className="workout-mode-label"><span className="live-dot" /> حالت تمرین</span>
        <span className="workout-topline__name">{activeTemplate.name}</span>
        {loggedSetCount > 0 && (
          <button type="button" className="workout-finish-top-btn" onClick={() => void handleFinishWorkout()}>
            <Check size={14} /> پایان و ثبت جلسه
          </button>
        )}
      </div>
      <div className="workout-progress-line"><div><span>پیشرفت جلسه</span><strong>{faNumber(loggedSetCount)} <small>/ {faNumber(plannedSetCount)} ست</small></strong></div><span className="progress-track"><span style={{ width: `${progressPercent}%` }} /></span><small>{faNumber(completedExercises)} / {faNumber(activeTemplate.exercises.length)} حرکت</small></div>

      <div className="workout-layout">
        <main className="workout-current-column">
          <div className="current-exercise-heading"><div><span className="eyebrow">حرکت {faDigits(String(currentExerciseIndex + 1).padStart(2, '0'))} از {faDigits(String(activeTemplate.exercises.length).padStart(2, '0'))}</span><h1>{currentWorkoutExercise.name}</h1>{exercise && <p>{exercise.primaryMuscles.join(' · ')} <span>·</span> {exercise.equipment[0]}</p>}</div>{exercise ? <Link className="text-link" to={`/exercise/${exercise.id}`}>راهنمای اجرا <ChevronRight size={15} /></Link> : <span className="muted">راهنمای تصویری برای این حرکت هنوز اضافه نشده است.</span>}</div>

          {exercise && hasExerciseFigure(exercise.id) && (
            <div className="workout-form-card">
              <div className="workout-form-card__visual">
                <img
                  src={exerciseFigureSrc(exercise.id, previewFrame)}
                  alt={exercise.name}
                  className="workout-form-card__img"
                  loading="eager"
                  decoding="async"
                />
                <button
                  type="button"
                  className="workout-form-card__toggle"
                  onClick={() => setPreviewFrame((f) => (f === 'start' ? 'main' : 'start'))}
                  title="تغییر وضعیت"
                >
                  {previewFrame === 'start' ? '۱: شروع' : '۲: اجرا'}
                </button>
              </div>
              <div className="workout-form-card__info">
                <span className="eyebrow">فرم و ایمنی کلیدی</span>
                <p>{exercise.safetyCues[0] ?? exercise.setup}</p>
                <div className="workout-form-card__tempo">
                  <span>تمپو: {exercise.tempo}</span>
                  <span>·</span>
                  <span>تنفس: {exercise.breathing}</span>
                </div>
              </div>
            </div>
          )}

          <div className="current-set-card panel-card">
            <div className="set-card-top"><div><span className="eyebrow">ست فعلی</span><div className="set-counter"><strong>{faDigits(String(setNumber).padStart(2, '0'))}</strong><span>/ {faDigits(String(prescription.sets).padStart(2, '0'))}</span></div></div><div className="target-chips"><span>{faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)} تکرار</span><span>{faDigits(prescription.targetRirLabel)} تکرار در ذخیره</span></div></div>
            <div className="set-target-note"><Info size={15} /><span>{loggedSet ? 'این ست ثبت شده است. پیش از رفتن به مرحلهٔ بعد، زمان استراحت را شروع کن.' : `برای ${faNumber(prescription.minReps)} تا ${faNumber(prescription.maxReps)} تکرار کنترل‌شده تلاش کن و حدود ${faDigits(prescription.targetRirLabel)} تکرار باکیفیت در ذخیره نگه دار.`}</span></div>
            {previous && <div className="last-time-card"><span className="eyebrow">دفعهٔ قبل · {formatDate(previous.session.startedAt, { month: 'short', day: 'numeric' })}</span><div>{previous.sets.map((set) => <span key={set.setNumber}>{kg(set.weightKg)} × {faNumber(set.reps)}<small> · {faNumber(set.rir)} تکرار در ذخیره</small></span>)}</div></div>}
            {!previous && suggestedReference !== undefined && <div className="reference-hint"><Info size={14} /><span>وزنهٔ تقریبی پروفایل: حدود {kg(suggestedReference)} · این مقدار تأیید نشده و فقط برای شناخت وزنهٔ کاری است؛ پیش از ثبت بررسی‌اش کن. این عدد نه ست قبلی است و نه رکورد یک‌تکرار بیشینه.</span></div>}

            <form className="set-log-form" onSubmit={(event) => void handleLogSet(event)}>
              <div className="set-input-grid">
                <label className="field-control"><span>وزنه <small>کیلوگرم</small></span><div className="input-with-unit"><input aria-label="وزنه به کیلوگرم" type="number" min="0" step="0.5" inputMode="decimal" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} disabled={Boolean(loggedSet)} placeholder="۰" required /><span>کیلوگرم</span></div></label>
                <label className="field-control"><span>تکرار</span><input aria-label="تعداد تکرار" type="number" min="1" max="100" step="1" inputMode="numeric" value={repsValue} onChange={(event) => setRepsValue(event.target.value)} disabled={Boolean(loggedSet)} required /></label>
                <label className="field-control"><span>تکرار در ذخیره <bdi dir="ltr">(RIR)</bdi></span><select aria-label="تکرار در ذخیره (RIR)" value={rirInput} onChange={(event) => setRirInput(event.target.value)} disabled={Boolean(loggedSet)}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{faNumber(value)} تکرار در ذخیره</option>)}</select></label>
              </div>
              <label className="field-control field-control--note"><span>یادداشت ست <small>اختیاری</small></span><input value={setNote} onChange={(event) => setSetNote(event.target.value)} disabled={Boolean(loggedSet)} placeholder="نکتهٔ فرم، تنظیم وسیله یا حس این ست…" /></label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              {!loggedSet ? <button className="button button--primary button--large button--full" type="submit">ثبت ست و شروع استراحت <ArrowRight size={17} /></button> : <div className="set-logged-confirm"><CheckCircle2 size={18} /><span>ست {faNumber(setNumber)} ثبت شد · {kg(loggedSet.weightKg)} × {faNumber(loggedSet.reps)} · {faNumber(loggedSet.rir)} تکرار در ذخیره</span></div>}
            </form>
          </div>

          {timerStarted ? (
            <section className={`rest-timer-card${remainingSeconds === 0 ? ' rest-timer-card--done' : ''}`} aria-live="polite">
              <div className="rest-timer-head"><div><span className="eyebrow">{remainingSeconds === 0 ? 'استراحت تمام شد' : 'برای ست بعدی ریکاوری کن'}</span><strong>زمان‌سنج استراحت</strong></div><span className="timer-readout">{timerLabel(remainingSeconds)}</span></div>
              <div className="timer-track"><span style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / prescription.restSeconds) * 100))}%` }} /></div>
              <div className="timer-controls">
                <div className="timer-adjusters"><button aria-label="کم‌کردن ۱۵ ثانیه" onClick={() => adjustTimer(-15)}><Minus size={14} /> ۱۵ ثانیه</button><button aria-label="افزودن ۱۵ ثانیه" onClick={() => adjustTimer(15)}><Plus size={14} /> ۱۵ ثانیه</button></div>
                <div className="timer-main-controls"><button className="button button--quiet button--small" onClick={togglePause}>{session.restTimer?.pausedRemainingSeconds !== null ? <><Play size={14} /> ادامه</> : <><Pause size={14} /> مکث</>}</button><button className="button button--quiet button--small" onClick={skipRest}>پایان استراحت</button></div>
              </div>
              {remainingSeconds === 0 && <button className="button button--primary button--large button--full next-set-button" onClick={() => void goToNextStep()}>{isFinalSet ? 'پایان تمرین' : session.currentSetIndex + 1 < prescription.sets ? 'ست بعدی' : 'حرکت بعدی'} <ArrowRight size={17} /></button>}
            </section>
          ) : loggedSet ? (
            <button className="button button--primary button--large button--full next-set-button" onClick={() => void goToNextStep()}>{isFinalSet ? 'پایان تمرین' : session.currentSetIndex + 1 < prescription.sets ? 'ست بعدی' : 'حرکت بعدی'} <ArrowRight size={17} /></button>
          ) : null}

          <details className="workout-notes-disclosure"><summary>یادداشت جلسه <span>اختیاری</span></summary><textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} onBlur={() => void saveSession({ ...session, notes: notesDraft })} rows={3} placeholder="انرژی، تمرکز یا نکته‌ای برای یادآوری…" /></details>
        </main>

        <aside className="workout-sidebar">
          {loggedSetCount > 0 && (
            <button
              type="button"
              className="button button--primary button--full"
              style={{ marginBottom: '12px' }}
              onClick={() => void handleFinishWorkout()}
            >
              <CheckCircle2 size={16} /> اتمام جلسه و ثبت پیشرفت
            </button>
          )}
          <section className="panel-card workout-queue-card"><div className="card-topline"><span className="eyebrow">ترتیب حرکت‌های امروز</span><span className="queue-count">{faNumber(activeTemplate.exercises.length)} حرکت</span></div><div className="workout-queue">{activeTemplate.exercises.map((item, index) => {
            const queueSession = session.exercises[index];
            const isCurrent = index === currentExerciseIndex;
            const isDone = queueSession ? queueSession.sets.length >= item.prescription.sets : false;
            return <div key={`${item.exerciseId}-${index}`} className={`queue-item${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}><span className="queue-item__number">{isDone ? <Check size={14} /> : faDigits(String(index + 1).padStart(2, '0'))}</span><div><strong>{item.name}</strong><span>{faNumber(queueSession?.sets.length ?? 0)}/{faNumber(item.prescription.sets)} ست · {faNumber(item.prescription.minReps)}–{faNumber(item.prescription.maxReps)}</span></div>{isCurrent && <span className="queue-current-mark" />}</div>;
          })}</div></section>
          <section className="panel-card workout-coach-note"><span className="coach-note-icon"><Info size={16} /></span><div><span className="eyebrow">یادآوری پیشرفت تدریجی</span><p>ابتدا در همین بازه تکرارها را بیشتر کن. فقط وقتی همهٔ ست‌های برنامه‌ریزی‌شده با فرم خوب به بیشترین تکرار و مقدار هدفِ تکرار در ذخیره رسیدند، افزایش وزنه را بررسی کن.</p></div></section>
          <button className="workout-exit-link" onClick={() => void handleExitClick()}>ذخیره و خروج از جلسه <ArrowLeft size={14} /></button>
        </aside>
      </div>
      <div className="workout-mobile-footer">
        <div className="workout-mobile-footer__stats">
          <span>{faNumber(loggedSetCount)}/{faNumber(plannedSetCount)} ست</span>
          <span>{timerStarted ? timerLabel(remainingSeconds) : 'تمرین در حال انجام'}</span>
        </div>
        <div className="workout-mobile-footer__actions">
          {loggedSetCount > 0 && (
            <button type="button" className="button button--primary button--small" onClick={() => void handleFinishWorkout()}>
              <CheckCircle2 size={14} /> اتمام جلسه
            </button>
          )}
          <button type="button" className="button button--ghost button--small" onClick={() => void handleExitClick()}>
            خروج
          </button>
        </div>
      </div>
    </div>
  );
}
