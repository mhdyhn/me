import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Info, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { exerciseById } from '../data/exercises';
import { exerciseFigureIds, exercisePhotoIds, exerciseFigureSrc } from '../data/exerciseFigures';
import { getWorkoutTemplate, workoutTemplates } from '../data/workouts';
import { getLastExercisePerformance, getProgressionAdvice } from '../lib/analytics';
import { categoryLabels, difficultyLabels } from '../lib/labels';
import { faDigits, faNumber, formatDate, kg } from '../lib/format';

export function ExerciseDetail() {
  const { exerciseId = '' } = useParams();
  const exercise = exerciseById(exerciseId);
  const navigate = useNavigate();
  const { sessions } = useGym();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const placements = workoutTemplates.flatMap((workout) => workout.exercises
    .filter((item) => item.exerciseId === exerciseId)
    .map((item) => ({ workout, prescription: item.prescription })));
  const previous = getLastExercisePerformance(sessions, exerciseId);

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

  return (
    <div className="page-stack exercise-detail-page">
      <Link to="/exercises" className="back-link"><ArrowLeft size={16} /> کتابخانهٔ حرکت‌ها</Link>
      <section className="exercise-hero panel-card">
        <div className="exercise-hero__copy">
          <div className="tag-row"><span className={`category-tag category-tag--${exercise.category.toLowerCase()}`}>{categoryLabels[exercise.category]}</span><span className="difficulty-tag">{difficultyLabels[exercise.difficulty]}</span></div>
          <h2>{exercise.name}</h2>
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

          <section className="panel-card movement-card">
            <div className="movement-card__heading"><div><span className="eyebrow">مرور مراحل حرکت</span><h3>شروع، حرکت، پایان.</h3></div><button className="button button--quiet button--small" onClick={replaySteps}><RotateCcw size={14} /> پخش دوبارهٔ مراحل</button></div>
            {exerciseFigureIds.has(exercise.id) ? (
              <figure className="exercise-figures">
                <div><img src={exerciseFigureSrc(exercise.id, 'start')} alt={`${exercise.name}: وضعیت شروع`} /><figcaption>شروع</figcaption></div>
                <div><img src={exerciseFigureSrc(exercise.id, 'main')} alt={`${exercise.name}: وضعیت اجرا`} /><figcaption>اجرا</figcaption></div>
              </figure>
            ) : null}
            {exercisePhotoIds.has(exercise.id) && <p className="figure-note">تصویرهای این حرکت با هوش مصنوعی ساخته شده‌اند؛ برای بررسی فرم، کنار مربی یا آینه تمرین کن.</p>}
            <p className="movement-hint">با انتخاب هر مرحله، متن آن مرحله نمایش داده می‌شود؛ برای دیدن کل چرخه «پخش دوبارهٔ مراحل» را بزن.</p>
            <div className="movement-timeline" role="tablist" aria-label="مراحل حرکت">
              {exercise.movementPhases.map((phase, index) => <button role="tab" aria-selected={phaseIndex === index} className={`movement-phase${phaseIndex === index ? ' is-active' : ''}`} key={phase.label} onClick={() => showStep(index)}><span>{faDigits(String(index + 1).padStart(2, '0'))}</span><strong>{phase.label}</strong></button>)}
            </div>
            <div className="movement-phase-copy" role="tabpanel"><span className="movement-phase-copy__arrow">↓</span><div><span className="eyebrow">{exercise.movementPhases[phaseIndex]?.label ?? 'شروع'}</span><p>{exercise.movementPhases[phaseIndex]?.instruction ?? exercise.startPosition}</p></div></div>
            <div className="movement-summary"><div><span className="summary-step">۰۱</span><span><strong>شروع</strong><small>{exercise.startPosition}</small></span></div><span className="summary-arrow">↓</span><div><span className="summary-step">۰۲</span><span><strong>اجرا</strong><small>{exercise.execution.join(' ')}</small></span></div><span className="summary-arrow">↓</span><div><span className="summary-step">۰۳</span><span><strong>پایان</strong><small>{exercise.finishPosition}</small></span></div></div>
          </section>

          <section className="panel-card technique-card">
            <SectionHeading eyebrow="نکته‌های فنی" title="هر تکرار را باکیفیت اجرا کن." />
            {exercise.machineSetup && <div className="machine-setup-block"><h3><span className="machine-setup-icon"><Info size={15} /></span>{exercise.machineSetup.title}</h3><ul>{exercise.machineSetup.points.map((point) => <li key={point}>{point}</li>)}</ul></div>}
            <div className="technique-columns">
              <div className="technique-block"><span className="eyebrow">آماده‌سازی</span><p>{exercise.setup}</p></div>
              <div className="technique-block"><span className="eyebrow">وضعیت آغاز</span><p>{exercise.startPosition}</p></div>
              <div className="technique-block"><span className="eyebrow">تنفس</span><p>{exercise.breathing}</p></div>
              <div className="technique-block"><span className="eyebrow">سرعت اجرا</span><p>{exercise.tempo}</p></div>
              <div className="technique-block technique-block--wide"><span className="eyebrow">وضعیت پایان</span><p>{exercise.finishPosition}</p></div>
            </div>
          </section>

          <section className="panel-card mistakes-card">
            <div className="mistakes-heading"><span className="warning-icon"><Info size={16} /></span><div><span className="eyebrow">بررسی فرم</span><h3>اشتباه‌های رایج</h3></div></div>
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
            <span className="eyebrow">عضله‌های درگیر</span>
            <div className="muscle-list"><span className="muscle-role">اصلی</span><div>{exercise.primaryMuscles.map((item) => <span className="muscle-chip muscle-chip--primary" key={item}>{item}</span>)}</div></div>
            {exercise.secondaryMuscles.length > 0 && <div className="muscle-list"><span className="muscle-role">کمکی</span><div>{exercise.secondaryMuscles.map((item) => <span className="muscle-chip" key={item}>{item}</span>)}</div></div>}
            {firstPrescription && <div className="rir-note"><span className="rir-note__mark" dir="ltr">RIR</span><p><strong>تکرار در ذخیره</strong><br />در پایان بیشتر ست‌ها حدود {faDigits(firstPrescription.targetRirLabel)} تکرار باکیفیت دیگر در توانت باقی بماند. کیفیت تکرار را در اولویت بگذار.</p></div>}
          </section>

          <section className="panel-card next-exercise-card"><span className="eyebrow">آمادهٔ تمرین هستی؟</span><h3>این نکته‌ها را در ست بعدی به‌کار ببر.</h3><p>وزنه، تکرار و میزان تلاش را ثبت کن تا جلسهٔ بعد بر پایهٔ دادهٔ واقعی باشد.</p><button className="button button--primary button--full" onClick={beginWorkout}>رفتن به تمرین <ArrowRight size={16} /></button></section>
          <Link className="text-link aside-library-link" to="/exercises"><ArrowLeft size={14} /> بازگشت به همهٔ حرکت‌ها</Link>
        </aside>
      </div>
      <div className="exercise-mobile-footer"><button className="button button--primary button--large button--full" onClick={beginWorkout}>شروع تمرین <ArrowRight size={16} /></button></div>
    </div>
  );
}
