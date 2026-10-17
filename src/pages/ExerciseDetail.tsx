import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Columns2, Info, Pause, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { getExerciseGuide, getExerciseVisualId } from '../lib/exerciseGuide';
import { exercisePhotoIds, exerciseFigureSrc, hasExerciseFigure, type FigureState } from '../data/exerciseFigures';
import { getWorkoutTemplate, useProgram } from '../lib/programStore';
import { getLastExercisePerformance, getProgressionAdvice } from '../lib/analytics';
import { categoryLabels, difficultyLabels } from '../lib/labels';
import { faDigits, faNumber, formatDate, kg } from '../lib/format';

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const exercise = getExerciseGuide(exerciseId);
  const visualExerciseId = getExerciseVisualId(exerciseId);
  const navigate = useNavigate();
  const { sessions } = useGym();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [replaying, setReplaying] = useState(false);

  // Lyfta-style video loop player state
  const [activeFrame, setActiveFrame] = useState<FigureState>('start');
  const [isPlayingLoop, setIsPlayingLoop] = useState(true);
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [viewMode, setViewMode] = useState<'loop' | 'compare'>('loop');
  const [loopProgress, setLoopProgress] = useState(0);
  const progressTimerRef = useRef<number | null>(null);

  const program = useProgram();
  const placements = program.flatMap((workout) => workout.exercises
    .filter((item) => item.exerciseId === exerciseId)
    .map((item) => ({ workout, prescription: item.prescription })));
  const previous = getLastExercisePerformance(sessions, exerciseId);

  // Update document title for SEO
  useEffect(() => {
    if (exercise) {
      document.title = `${exercise.name}${exercise.englishName ? ` (${exercise.englishName})` : ''} | آموزش و فرم صحیح | میتی`;
    }
  }, [exercise]);

  // Step-by-step timeline replayer
  useEffect(() => {
    if (!replaying) return;
    const timer = window.setInterval(() => {
      setPhaseIndex((current) => {
        if (current >= (exercise?.movementPhases.length ?? 1) - 1) {
          setReplaying(false);
          return 0;
        }
        return current + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [replaying, exercise?.movementPhases.length]);

  // Lyfta-style animated visual loop player
  useEffect(() => {
    if (!isPlayingLoop || viewMode !== 'loop' || !exercise || !hasExerciseFigure(visualExerciseId)) {
      setLoopProgress(0);
      return;
    }

    const intervalMs = speed === 1 ? 1200 : 2000;
    const stepMs = 50;
    let elapsed = 0;

    const interval = window.setInterval(() => {
      elapsed += stepMs;
      const pct = Math.min(100, Math.round((elapsed / intervalMs) * 100));
      setLoopProgress(pct);

      if (elapsed >= intervalMs) {
        elapsed = 0;
        setActiveFrame((prev) => (prev === 'start' ? 'main' : 'start'));
      }
    }, stepMs);

    progressTimerRef.current = interval;
    return () => window.clearInterval(interval);
  }, [isPlayingLoop, viewMode, speed, exerciseId, visualExerciseId]);

  if (!exercise) {
    return <EmptyState title="حرکت پیدا نشد" detail="این حرکت در کتابخانهٔ فعلی وجود ندارد." action={<Link to="/exercises" className="button button--secondary">بازگشت به حرکت‌ها</Link>} />;
  }

  const firstPrescription = placements[0]?.prescription;
  const advice = previous && firstPrescription ? getProgressionAdvice(firstPrescription, previous.sets) : null;

  const replaySteps = () => {
    setPhaseIndex(0);
    setReplaying(true);
  };

  /** Shows one written step and stops the timeline there. */
  const showStep = (index: number) => {
    setReplaying(false);
    setPhaseIndex(index);
  };

  const beginWorkout = () => {
    const firstTemplate = placements[0]?.workout;
    if (firstTemplate) navigate(`/workout/${firstTemplate.id}`);
    else navigate('/program');
  };

  const hasFigure = hasExerciseFigure(visualExerciseId);

  return (
    <div className="page-stack exercise-detail-page">
      <Link to={exerciseId.startsWith('admin-') ? '/program' : '/exercises'} className="back-link"><ArrowLeft size={16} /> {exerciseId.startsWith('admin-') ? 'بازگشت به برنامه' : 'کتابخانهٔ حرکت‌ها'}</Link>
      <section className="exercise-hero panel-card">
        <div className="exercise-hero__copy">
          <div className="tag-row"><span className={`category-tag category-tag--${exercise.category.toLowerCase()}`}>{categoryLabels[exercise.category]}</span><span className="difficulty-tag">{difficultyLabels[exercise.difficulty]}</span></div>
          <h2>{exercise.name}</h2>
          {exercise.englishName && <span className="account-muted" dir="ltr" style={{ display: 'block', fontSize: 13, marginTop: -2, marginBottom: 4 }}>{exercise.englishName}</span>}
          <p>{exercise.primaryMuscles.join(' · ')}{exercise.secondaryMuscles.length ? `  /  ${exercise.secondaryMuscles.join(' · ')}` : ''}</p>
          <div className="exercise-hero__chips">{exercise.equipment.map((item) => <span key={item}>{item}</span>)}</div>
          {placements.length > 0 && <div className="exercise-program-placement"><span className="eyebrow">در برنامهٔ تو</span>{placements.map(({ workout }) => <span key={workout.id} className="placement-pill">{workout.name}</span>)}</div>}
        </div>
        <div className="exercise-hero__side"><span className="exercise-hero__motif"><span /><span /><span /></span><button className="button button--primary button--small" onClick={beginWorkout}>تمرین این حرکت <ArrowRight size={15} /></button></div>
      </section>

      <div className="exercise-detail-grid">
        <div className="exercise-detail-main page-stack page-stack--tight">
          {placements.length > 0 && (
            <section className="panel-card prescription-card">
              <div className="card-topline"><span className="eyebrow">برنامهٔ فعلی</span><Sparkles size={16} className="icon-accent" /></div>
              <div className="prescription-grid">{placements.slice(0, 3).map(({ workout, prescription }) => <div className="prescription-item" key={workout.id}><span>{workout.name}</span><strong>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</strong><small>{faDigits(prescription.targetRirLabel)} تکرار در ذخیره · استراحت {prescription.restSeconds >= 60 ? `${faNumber(Math.floor(prescription.restSeconds / 60))}:${faDigits(String(prescription.restSeconds % 60).padStart(2, '0'))}` : `${faNumber(prescription.restSeconds)} ثانیه`}</small></div>)}</div>
            </section>
          )}

          {/* Lyfta-style animated video/visual loop container */}
          {hasFigure && (
            <section className="lyfta-player" aria-label="آموزش تصویری حرکت به سبک Lyfta">
              {viewMode === 'loop' ? (
                <div className="lyfta-player__screen">
                  <div className="lyfta-player__badge">
                    <span
                      className={`lyfta-player__badge-dot ${
                        activeFrame === 'start' ? 'lyfta-player__badge-dot--start' : 'lyfta-player__badge-dot--main'
                      }`}
                    />
                    <span>{activeFrame === 'start' ? 'وضعیت ۱: آماده‌سازی و شروع' : 'وضعیت ۲: اوج انقباض و اجرا'}</span>
                  </div>
                  <img
                    src={exerciseFigureSrc(visualExerciseId, 'start')}
                    alt={`${exercise.name}: وضعیت شروع`}
                    className="lyfta-player__img lyfta-player__img--start"
                    style={{ opacity: activeFrame === 'start' ? 1 - loopProgress / 100 : loopProgress / 100 }}
                    loading="eager"
                    decoding="async"
                  />
                  <img
                    src={exerciseFigureSrc(visualExerciseId, 'main')}
                    alt={`${exercise.name}: وضعیت انقباض`}
                    className="lyfta-player__img lyfta-player__img--main"
                    style={{ opacity: activeFrame === 'start' ? loopProgress / 100 : 1 - loopProgress / 100 }}
                    loading="eager"
                    decoding="async"
                  />
                  <div className="lyfta-player__progress">
                    <div className="lyfta-player__progress-bar" style={{ width: `${loopProgress}%` }} />
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 14px 0' }}>
                  <figure className="exercise-figures" style={{ margin: 0 }}>
                    <div>
                      <img src={exerciseFigureSrc(visualExerciseId, 'start')} alt={`${exercise.name}: وضعیت شروع`} loading="lazy" decoding="async" />
                      <figcaption>شروع</figcaption>
                    </div>
                    <div>
                      <img src={exerciseFigureSrc(visualExerciseId, 'main')} alt={`${exercise.name}: وضعیت اجرا`} loading="lazy" decoding="async" />
                      <figcaption>اجرا</figcaption>
                    </div>
                  </figure>
                </div>
              )}

              <div className="lyfta-player__controls">
                <div className="lyfta-player__buttons">
                  <button
                    type="button"
                    className="button button--ghost"
                    style={{ padding: '6px 12px', fontSize: 13, height: 'auto' }}
                    onClick={() => setIsPlayingLoop(!isPlayingLoop)}
                    title={isPlayingLoop ? 'توقف انیمیشن' : 'پخش لوپ متحرک'}
                  >
                    {isPlayingLoop ? <><Pause size={15} /> توقف</> : <><Play size={15} /> پخش لوپ</>}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    style={{ padding: '6px 12px', fontSize: 13, height: 'auto' }}
                    onClick={() => {
                      setViewMode(viewMode === 'loop' ? 'compare' : 'loop');
                      setIsPlayingLoop(false);
                    }}
                  >
                    <Columns2 size={15} /> {viewMode === 'loop' ? 'مقایسه دو فاز' : 'نمایش لوپ'}
                  </button>
                </div>

                <div className="lyfta-player__buttons">
                  <span className="account-muted" style={{ fontSize: 12 }}>سرعت:</span>
                  <button
                    type="button"
                    className={`lyfta-player__speed-btn${speed === 1 ? ' is-active' : ''}`}
                    onClick={() => setSpeed(1)}
                  >
                    ۱x
                  </button>
                  <button
                    type="button"
                    className={`lyfta-player__speed-btn${speed === 0.5 ? ' is-active' : ''}`}
                    onClick={() => setSpeed(0.5)}
                  >
                    ۰٫۵x
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="panel-card movement-card">
            <div className="movement-card__heading"><div><span className="eyebrow">مرور مراحل حرکت</span><h3>شروع، حرکت، پایان.</h3></div><button className="button button--quiet button--small" onClick={replaySteps}><RotateCcw size={14} /> پخش دوبارهٔ مراحل</button></div>
            {exercisePhotoIds.has(visualExerciseId) && <p className="figure-note">تصویرهای آموزشی منطبق بر الگوی حرکتی استاندارد و مفاصل هدف طراحی شده‌اند.</p>}
            <p className="movement-hint">با انتخاب هر مرحله، متن آن مرحله نمایش داده می‌شود؛ برای دیدن کل چرخه «پخش دوبارهٔ مراحل» را بزن.</p>
            <div className="movement-timeline" role="tablist" aria-label="مراحل حرکت">
              {exercise.movementPhases.map((phase, index) => <button role="tab" aria-selected={phaseIndex === index} className={`movement-phase${phaseIndex === index ? ' is-active' : ''}`} key={phase.label} onClick={() => showStep(index)}><span>{faDigits(String(index + 1).padStart(2, '0'))}</span><strong>{phase.label}</strong></button>)}
            </div>
            <div className="movement-phase-copy" role="tabpanel"><span className="movement-phase-copy__arrow">↓</span><div><span className="eyebrow">{exercise.movementPhases[phaseIndex]?.label ?? 'شروع'}</span><p>{exercise.movementPhases[phaseIndex]?.instruction ?? exercise.startPosition}</p></div></div>
            <div className="movement-summary"><div><span className="summary-step">۰۱</span><span><strong>شروع</strong><small>{exercise.startPosition}</small></span></div><span className="summary-arrow">↓</span><div><span className="summary-step">۰۲</span><span><strong>اجرا</strong><small>{exercise.execution.join(' ')}</small></span></div><span className="summary-arrow">↓</span><div><span className="summary-step">۰۳</span><span><strong>پایان</strong><small>{exercise.finishPosition}</small></span></div></div>
          </section>

          <section className="panel-card technique-card">
            <SectionHeading eyebrow="نکته‌های فنی و استاندارد" title="هر تکرار را با فرم دقیق اجرا کن." />
            {exercise.machineSetup && <div className="machine-setup-block"><h3><span className="machine-setup-icon"><Info size={15} /></span>{exercise.machineSetup.title}</h3><ul>{exercise.machineSetup.points.map((point) => <li key={point}>{point}</li>)}</ul></div>}
            <div className="technique-columns">
              <div className="technique-block"><span className="eyebrow">آماده‌سازی و استقرار</span><p>{exercise.setup}</p></div>
              <div className="technique-block"><span className="eyebrow">وضعیت آغاز</span><p>{exercise.startPosition}</p></div>
              <div className="technique-block"><span className="eyebrow">الگوی تنفس</span><p>{exercise.breathing}</p></div>
              <div className="technique-block"><span className="eyebrow">سرعت و تمپو</span><p>{exercise.tempo}</p></div>
              <div className="technique-block technique-block--wide"><span className="eyebrow">وضعیت پایان و انقباض</span><p>{exercise.finishPosition}</p></div>
            </div>
          </section>

          <section className="panel-card mistakes-card">
            <div className="mistakes-heading"><span className="warning-icon"><Info size={16} /></span><div><span className="eyebrow">بررسی فرم و ایمنی</span><h3>اشتباه‌های رایج و خطرات</h3></div></div>
            <ul className="mistake-list">{exercise.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul>
            <div className="safety-note"><ShieldCheck size={16} /><span>{exercise.safetyCues.join(' ')}</span></div>
          </section>
        </div>

        <aside className="exercise-detail-aside page-stack page-stack--tight">
          <section className="panel-card previous-card">
            <div className="card-topline"><span className="eyebrow">عملکرد قبلی</span><Clock3 size={15} className="icon-muted" /></div>
            {previous ? <>
              <p className="previous-date">{getWorkoutTemplate(previous.session.templateId)?.name ?? previous.session.name} · {formatDate(previous.session.startedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              <div className="previous-set-list">{previous.sets.map((set) => <div key={set.setNumber}><span>ست {faNumber(set.setNumber)}</span><strong>{kg(set.weightKg)} × {faNumber(set.reps)}</strong><small>{faNumber(set.rir)} تکرار در ذخیره</small></div>)}</div>
              {advice && <div className={`progression-advice${advice.readyToIncrease ? ' progression-advice--ready' : ''}`}><CheckCircle2 size={16} /><div><strong>{advice.title}</strong><span>{advice.detail}</span></div></div>}
            </> : <div className="previous-empty"><span className="previous-empty__mark">—</span><strong>هنوز ستی ثبت نشده</strong><p>پس از اولین جلسه، وزنه، تکرار و میزان تکرار در ذخیره اینجا نمایش داده می‌شود.</p>{exercise.referenceWeightKg && <div className="reference-note"><Info size={14} /><span>وزنهٔ تقریبی گزارش‌شده: <strong>حدود {kg(exercise.referenceWeightKg)}</strong>. {exercise.referenceNote} پیش از ثبت، وزنهٔ کاری را بررسی کن.</span></div>}</div>}
          </section>

          <section className="panel-card muscle-card">
            <span className="eyebrow">عضله‌های درگیر (آناتومی هدف)</span>
            <div className="muscle-list"><span className="muscle-role">اصلی</span><div>{exercise.primaryMuscles.map((item) => <span className="muscle-chip muscle-chip--primary" key={item}>{item}</span>)}</div></div>
            {exercise.secondaryMuscles.length > 0 && <div className="muscle-list"><span className="muscle-role">کمکی</span><div>{exercise.secondaryMuscles.map((item) => <span className="muscle-chip" key={item}>{item}</span>)}</div></div>}
            {firstPrescription && <div className="rir-note"><span className="rir-note__mark" dir="ltr">RIR</span><p><strong>تکرار در ذخیره</strong><br />در پایان بیشتر ست‌ها حدود {faDigits(firstPrescription.targetRirLabel)} تکرار باکیفیت دیگر در توانت باقی بماند. کیفیت تکرار را در اولویت بگذار.</p></div>}
          </section>

          <section className="panel-card next-exercise-card"><span className="eyebrow">آمادهٔ تمرین هستی؟</span><h3>این نکته‌ها را در ست بعدی به‌کار ببر.</h3><p>وزنه، تکرار و میزان تلاش را ثبت کن تا جلسهٔ بعد بر پایهٔ دادهٔ واقعی باشد.</p><button className="button button--primary button--full" onClick={beginWorkout}>رفتن به تمرین <ArrowRight size={16} /></button></section>
          <Link className="text-link aside-library-link" to={exerciseId.startsWith('admin-') ? '/program' : '/exercises'}><ArrowLeft size={14} /> {exerciseId.startsWith('admin-') ? 'بازگشت به برنامه' : 'بازگشت به همهٔ حرکت‌ها'}</Link>
        </aside>
      </div>
      <div className="exercise-mobile-footer"><button className="button button--primary button--large button--full" onClick={beginWorkout}>شروع تمرین <ArrowRight size={16} /></button></div>
    </div>
  );
}
