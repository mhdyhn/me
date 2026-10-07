import { ArrowRight, Check, Clock3, Dumbbell, Info, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { exerciseById } from '../data/exercises';
import { workoutTemplates } from '../data/workouts';
import { getCompletedThisWeek } from '../lib/analytics';
import { faDigits, faNumber } from '../lib/format';

export function Program() {
  const { sessions } = useGym();
  const weeklyCount = getCompletedThisWeek(sessions);

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="تقسیم‌بندی تمرین‌ها" title="هفته‌ات را با برنامه پیش ببر." description="پنج جلسهٔ اصلی، یک روز اختیاری با خستگی کم و فرصت کافی برای ریکاوری. ترتیب جلسه‌ها را با سرعت مناسب خودت پیش ببر." />
      <div className="program-overview panel-card">
        <div className="program-overview__main"><span className="eyebrow">ساختار هفتگی</span><strong>پرس · کشش · پا · بالاتنه · پایین‌تنه</strong><span>برای رشد متعادل و پیشرفت تدریجی طراحی شده است.</span></div>
        <div className="program-overview__stat"><b>{faNumber(weeklyCount)}<small> / {faNumber(5)}</small></b><span>جلسهٔ اصلی<br />این هفته</span></div>
        <div className="program-overview__stat"><b>حدود {faNumber(90)}<small> دقیقه</small></b><span>سقف زمان<br />هر جلسه</span></div>
      </div>
      <div className="program-list">
        {workoutTemplates.map((workout, index) => {
          const exerciseCount = workout.exercises.length;
          const setCount = workout.exercises.reduce((total, item) => total + item.prescription.sets, 0);
          const lastSession = [...sessions].filter((session) => session.templateId === workout.id && session.status === 'completed').sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
          return (
            <article key={workout.id} className={`program-day panel-card${workout.optional ? ' program-day--optional' : ''}`}>
              <div className="program-day__index"><span>{faDigits(String(index + 1).padStart(2, '0'))}</span><span className="day-line" /></div>
              <div className="program-day__main">
                <div className="program-day__heading">
                  <div><div className="program-day__eyebrow"><span>{workout.dayLabel}</span>{workout.optional && <span className="optional-pill"><Sparkles size={12} /> اختیاری</span>}</div><h3>{workout.name}</h3><p>{workout.focus}</p></div>
                  <Link to={`/workout/${workout.id}`} className={`button ${workout.optional ? 'button--secondary' : 'button--primary'} button--small`}>شروع جلسه <ArrowRight size={15} /></Link>
                </div>
                <p className="program-day__description">{workout.description}</p>
                <div className="program-day__meta"><span><Dumbbell size={14} /> {faNumber(exerciseCount)} حرکت · {faNumber(setCount)} ست</span><span><Clock3 size={14} /> حدود {faNumber(workout.durationMinutes)} دقیقه</span>{lastSession && <span className="program-day__last"><Check size={14} /> آخرین اجرا: {new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { month: 'short', day: 'numeric' }).format(new Date(lastSession.startedAt))}</span>}</div>
                <details className="program-exercise-details">
                  <summary>نمایش ترتیب حرکت‌ها <span>{faNumber(exerciseCount)} حرکت</span></summary>
                  <ol>{workout.exercises.map(({ exerciseId, prescription }, itemIndex) => {
                    const exercise = exerciseById(exerciseId);
                    return <li key={`${exerciseId}-${itemIndex}`}><Link to={`/exercise/${exerciseId}`}>{exercise?.name ?? exerciseId}</Link><span>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</span></li>;
                  })}</ol>
                </details>
              </div>
            </article>
          );
        })}
      </div>
      <div className="program-rest-note"><span className="subtle-icon"><Info size={17} /></span><p><strong>استراحت هم بخشی از برنامه است.</strong> روز هفتم استراحت کن. جلسهٔ اختیاری را سبک نگه دار و اگر خواب، انرژی یا ریکاوری‌ات مناسب نیست، از آن بگذر.</p></div>
    </div>
  );
}
