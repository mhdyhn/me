import { ArrowRight, Check, Clock3, Dumbbell, Info, Moon, Sparkles, SunMedium } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { exerciseById } from '../data/exercises';
import { primaryWorkoutTemplates } from '../data/workouts';
import { getCompletedThisWeek } from '../lib/analytics';
import { getProgramWeek } from '../lib/program';
import { faDigits, faNumber } from '../lib/format';

const weekDays = ['دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export function Program() {
  const { sessions, profile } = useGym();
  const weeklyCount = getCompletedThisWeek(sessions);
  const programWeek = getProgramWeek(sessions);

  return (
    <div className="page-stack">
      <SectionHeading eyebrow={`هفتهٔ ${faNumber(programWeek)} از ۸ · برنامهٔ شخصی`} title="هفته‌ات را با برنامه پیش ببر." description="دوشنبه تا جمعه پنج جلسهٔ اصلی، شنبه جلسهٔ اختیاری فقط در صورت ریکاوری خوب، و یکشنبه استراحت کامل." />
      <div className="program-overview panel-card">
        <div className="program-overview__main"><span className="eyebrow">ساختار هفتگی</span><strong>پرس · کشش · پا · بالاتنه · پایین‌تنه</strong><span>هفتهٔ پنجم کاهش حجم دارد؛ هفته‌های ۶ تا ۸ برای تثبیت و پیشرفت تدریجی‌اند.</span></div>
        <div className="program-overview__stat"><b>{faNumber(weeklyCount)}<small> / {faNumber(5)}</small></b><span>جلسهٔ اصلی<br />این هفته</span></div>
        <div className="program-overview__stat"><b>حدود {faNumber(profile.sessionMinutes)}<small> دقیقه</small></b><span>سقف زمان<br />هر جلسه</span></div>
      </div>

      <div className="settings-disclaimer"><Info size={16} /><span><strong>سابقهٔ شانه ثبت شده است:</strong> آسیب/کشیدگی شدید هنگام آبشار والیبال. برنامه دامنهٔ دردناک را نادیده نمی‌گیرد؛ هر حرکت دردناک یا محدودکننده را متوقف کن و انتخاب حرکت و دامنهٔ مناسب را با متخصص بررسی کن.</span></div>

      <div className="program-list">
        {primaryWorkoutTemplates.map((workout, index) => {
          const exerciseCount = workout.exercises.length;
          const setCount = workout.exercises.reduce((total, item) => total + item.prescription.sets, 0);
          const lastSession = [...sessions].filter((session) => session.templateId === workout.id && session.status === 'completed').sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
          return (
            <article key={workout.id} className="program-day panel-card">
              <div className="program-day__index"><span>{faDigits(String(index + 1).padStart(2, '0'))}</span><span className="day-line" /></div>
              <div className="program-day__main">
                <div className="program-day__heading">
                  <div><div className="program-day__eyebrow"><span>{weekDays[index]} · {workout.dayLabel}</span></div><h3>{workout.name}</h3><p>{workout.focus}</p></div>
                  <Link to={`/workout/${workout.id}`} className="button button--primary button--small">شروع جلسه <ArrowRight size={15} /></Link>
                </div>
                <p className="program-day__description">{workout.description}</p>
                <div className="program-day__meta"><span><Dumbbell size={14} /> {faNumber(exerciseCount)} حرکت · حدود {faNumber(setCount)} ست پایه</span><span><Clock3 size={14} /> حدود {faNumber(workout.durationMinutes)} دقیقه</span>{lastSession && <span className="program-day__last"><Check size={14} /> آخرین اجرا: {new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { month: 'short', day: 'numeric' }).format(new Date(lastSession.startedAt))}</span>}</div>
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
        <article className="program-day panel-card program-day--optional"><div className="program-day__index"><span>{faDigits('۰۶')}</span><span className="day-line" /></div><div className="program-day__main"><div className="program-day__heading"><div><div className="program-day__eyebrow"><span>شنبه</span><span className="optional-pill"><Sparkles size={12} /> اختیاری</span></div><h3>حرکات کمکی</h3><p>سرشانه · بازو · شکم</p></div><Link to="/workout/optional-accessories" className="button button--secondary button--small">در صورت ریکاوری خوب <ArrowRight size={15} /></Link></div><p className="program-day__description">جلسهٔ کوتاه و کم‌خستگی؛ در صورت خستگی، خواب ضعیف یا درد حذفش کن.</p></div></article>
        <article className="program-day panel-card program-day--rest"><div className="program-day__index"><span><Moon size={18} /></span><span className="day-line" /></div><div className="program-day__main"><div className="program-day__heading"><div><div className="program-day__eyebrow"><span>یکشنبه</span><span className="optional-pill"><SunMedium size={12} /> استراحت</span></div><h3>استراحت کامل</h3><p>ریکاوری · خواب · تغذیه · آماده‌سازی هفتهٔ بعد</p></div></div><p className="program-day__description">امروز برای جبران تمرین از دست‌رفته، فشار اضافه نده؛ هدف این روز ریکاوری است.</p></div></article>
      </div>
    </div>
  );
}
