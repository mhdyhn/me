import { useState } from 'react';
import { ArrowRight, Check, Clock3, CreditCard, Dumbbell, Info, Lock, Pencil, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { exerciseById } from '../data/exercises';
import { getCompletedThisWeek } from '../lib/analytics';
import { isProgramReadOnly, useAssignedMeta, useProgram } from '../lib/programStore';
import { faDigits, faNumber } from '../lib/format';
import { ApiError, api } from '../lib/api';

export function Program() {
  const { sessions } = useGym();
  const weeklyCount = getCompletedThisWeek(sessions);
  const workoutTemplates = useProgram();
  const readOnly = isProgramReadOnly();
  const assignedMeta = useAssignedMeta();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const primaryCount = workoutTemplates.filter((workout) => !workout.optional).length;
  const averageMinutes = workoutTemplates.length ? Math.round(workoutTemplates.reduce((sum, workout) => sum + workout.durationMinutes, 0) / workoutTemplates.length) : 0;
  const structure = workoutTemplates.map((workout) => workout.name).join(' · ');

  async function startPayment() {
    setPayError(null);
    setPaying(true);
    try {
      const res = await api<{ authority: string; paymentUrl: string }>('POST', '/pay/start', {});
      window.location.href = res.paymentUrl;
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'خطا در اتصال به درگاه پرداخت.');
      setPaying(false);
    }
  }

  // If the coach set a price on the program and the student has not paid yet, show the payment locked view.
  if (readOnly && assignedMeta && assignedMeta.priceTomans > 0 && !assignedMeta.isPaid) {
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow="برنامهٔ تمرینی اختصاصی"
          title={assignedMeta.title}
          description={`تنظیم‌شده توسط ${assignedMeta.coachName ?? 'مربی شما'}`}
        />
        <div className="panel-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', display: 'grid', gap: '1.2rem', placeItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(217, 246, 111, 0.1)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
            <Lock size={32} />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>این برنامه نیازمند پرداخت و فعال‌سازی است</h2>
          <p className="account-muted" style={{ margin: 0, maxWidth: 440 }}>
            مربی شما این برنامه را اختصاصی برای شما آماده کرده است. با پرداخت هزینه از طریق درگاه امن شاپرک و زرین‌پال، تمام روزها و حرکت‌های برنامه فوراً برای شما بازگشایی می‌شوند.
          </p>
          <div style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--surface-soft)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <CreditCard size={20} className="account-muted" />
            <span style={{ fontSize: 14 }}>مبلغ قابل پرداخت:</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>{faNumber(assignedMeta.priceTomans)} تومان</strong>
          </div>
          {payError && <p className="form-error" role="alert">{payError}</p>}
          <button
            type="button"
            className="button button--primary"
            style={{ minWidth: 260, fontSize: 15, padding: '12px 20px' }}
            disabled={paying}
            onClick={() => void startPayment()}
          >
            {paying ? 'در حال انتقال به درگاه…' : `پرداخت آنلاین و فعال‌سازی (${faNumber(assignedMeta.priceTomans)} تومان)`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="تقسیم‌بندی تمرین‌ها" title="هفته‌ات را با برنامه پیش ببر." description="جلسه‌های اصلی، روزهای اختیاری و زمان استراحت، همه از برنامهٔ همین حساب." />
      {!readOnly && <div className="program-editor-entry"><Link to="/program/edit" className="button button--secondary button--small"><Pencil size={14} /> ویرایش برنامه</Link></div>}
      {readOnly && <p className="account-muted">این برنامه را مربی شما تنظیم کرده است.</p>}
      <div className="program-overview panel-card">
        <div className="program-overview__main"><span className="eyebrow">ساختار هفتگی</span><strong>{structure || 'هنوز روزی نیست'}</strong><span>{readOnly ? 'برنامهٔ تنظیم‌شده توسط مربی شما' : 'برنامهٔ شخصی همین حساب'}</span></div>
        <div className="program-overview__stat"><b>{faNumber(weeklyCount)}<small> / {faNumber(primaryCount)}</small></b><span>جلسهٔ اصلی<br />این هفته</span></div>
        <div className="program-overview__stat"><b>{faNumber(averageMinutes)}<small> دقیقه</small></b><span>میانگین زمان<br />هر جلسه</span></div>
      </div>
      {workoutTemplates.length === 0 && (
        <p className="account-muted">{readOnly ? 'مربی هنوز برنامه‌ای برای شما ثبت نکرده است.' : 'هنوز برنامه‌ای نساخته‌اید. از «ویرایش برنامه» روزها و حرکت‌ها را اضافه کنید.'}</p>
      )}
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
                  <ol>{workout.exercises.map(({ exerciseId, name, prescription }, itemIndex) => {
                    const exercise = exerciseById(exerciseId);
                    return <li key={`${exerciseId}-${itemIndex}`}>{exercise ? <Link to={`/exercise/${exerciseId}`}>{name}</Link> : <span>{name}</span>}<span>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</span></li>;
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
