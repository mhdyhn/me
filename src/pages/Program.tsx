import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock3, CreditCard, Dumbbell, Info, Lock, Pencil, PlusCircle, Sparkles, Trash2, X, CalendarPlus, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { getExerciseGuide } from '../lib/exerciseGuide';
import { getCompletedThisWeek } from '../lib/analytics';
import { isProgramReadOnly, useAssignedMeta, useProgram } from '../lib/programStore';
import { clearProgram, resetProgram, saveProgram, syncCloudProgram } from '../lib/programPersistence';
import { presetTemplates, type PresetTemplate } from '../lib/programTemplates';
import { faDigits, faNumber } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { useSession } from '../context/SessionContext';
import { adminProgramGuidelines } from '../data/adminProgram';

export function Program() {
  const { sessions, activeSession } = useGym();
  const { user } = useSession();
  const navigate = useNavigate();
  const weeklyCount = getCompletedThisWeek(sessions);
  const workoutTemplates = useProgram();
  const readOnly = isProgramReadOnly();
  const assignedMeta = useAssignedMeta();

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!readOnly) {
      void syncCloudProgram();
    }
  }, [readOnly]);

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

  async function handleApplyTemplate(template: PresetTemplate, openEditor = false) {
    if (template.id === 'blank' || openEditor) {
      setShowTemplateModal(false);
      navigate('/program/edit?mode=blank');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const days = template.buildWorkoutTemplates();
      await saveProgram(days);
      setShowTemplateModal(false);
      setFeedback({ text: `«${template.title}» با موفقیت فعال شد.`, type: 'success' });
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'خطا در ایجاد برنامه جدید', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProgram() {
    setBusy(true);
    setFeedback(null);
    try {
      await clearProgram();
      setShowDeleteModal(false);
      setFeedback({ text: 'برنامهٔ تمرینی فعلی با موفقیت حذف شد. یک نسخه پشتیبان حفظ شده است.', type: 'success' });
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'خطا در حذف برنامه', type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreRage() {
    setBusy(true);
    setFeedback(null);
    try {
      await resetProgram();
      setShowDeleteModal(false);
      setFeedback({ text: 'برنامهٔ پیش‌فرض RAGE با موفقیت بازگردانی شد.', type: 'success' });
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : 'خطا در بازگردانی برنامه', type: 'error' });
    } finally {
      setBusy(false);
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

      {/* Manager / Admin Program Actions Toolbar */}
      {!readOnly && (
        <div className="program-manager-bar">
          <div className="program-manager-badge">
            <Sparkles size={15} /> <span>نسخهٔ مدیریت برنامه</span>
          </div>
          <div className="program-manager-actions">
            <button
              type="button"
              className="button button--primary button--small"
              onClick={() => setShowTemplateModal(true)}
            >
              <PlusCircle size={14} /> تعریف برنامه جدید
            </button>
            <Link to="/program/edit" className="button button--secondary button--small">
              <Pencil size={14} /> ویرایش برنامه
            </Link>
            {workoutTemplates.length > 0 && (
              <button
                type="button"
                className="button button--ghost button--small button--danger-text"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 size={14} /> حذف برنامه
              </button>
            )}
          </div>
        </div>
      )}

      {readOnly && <p className="account-muted">این برنامه را مربی شما تنظیم کرده است.</p>}

      {feedback && (
        <div className={feedback.type === 'success' ? 'form-success' : 'form-error'} role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="program-overview panel-card">
        <div className="program-overview__main">
          <span className="eyebrow">ساختار هفتگی</span>
          <strong>{structure || 'هنوز برنامه‌ای تعریف نشده'}</strong>
          <span>{readOnly ? 'برنامهٔ تنظیم‌شده توسط مربی شما' : 'برنامهٔ فعال حساب کاربری'}</span>
        </div>
        <div className="program-overview__stat">
          <b>{faNumber(weeklyCount)}<small> / {faNumber(primaryCount)}</small></b>
          <span>جلسهٔ اصلی<br />این هفته</span>
        </div>
        <div className="program-overview__stat">
          <b>{faNumber(averageMinutes)}<small> دقیقه</small></b>
          <span>میانگین زمان<br />هر جلسه</span>
        </div>
      </div>

      {user?.role === 'admin' && (
        <details className="panel-card" style={{ padding: 16 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>قوانین اجرا، تغذیه و ریکاوری برنامهٔ شخصی</summary>
          <ul style={{ margin: '12px 0 0', paddingInlineStart: 24, lineHeight: 1.9 }}>
            {adminProgramGuidelines.map((guideline) => <li key={guideline}>{guideline}</li>)}
          </ul>
        </details>
      )}

      {workoutTemplates.length === 0 && (
        <div className="panel-card program-empty-card">
          <div className="program-empty-icon">
            <CalendarPlus size={36} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>هنوز برنامه‌ای تعریف نشده است</h3>
          <p className="account-muted" style={{ margin: 0, maxWidth: 480, lineHeight: 1.8 }}>
            {readOnly
              ? 'مربی هنوز برنامه‌ای برای شما ثبت نکرده است.'
              : 'می‌توانید همین حالا با استفاده از الگوهای استاندارد (۳ روزه، ۴ روزه، ۵ روزه یا RAGE) یک برنامه بسازید یا حرکت‌ها را از صفر طراحی کنید.'}
          </p>
          {!readOnly && (
            <div className="program-empty-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => setShowTemplateModal(true)}
              >
                <PlusCircle size={16} /> تعریف برنامه جدید از الگوها
              </button>
              <Link to="/program/edit" className="button button--secondary">
                <Pencil size={16} /> ساخت در ویرایشگر
              </Link>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void handleRestoreRage()}
                disabled={busy}
              >
                بارگذاری برنامهٔ پیش‌فرض RAGE
              </button>
            </div>
          )}
        </div>
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
                  <div>
                    <div className="program-day__eyebrow">
                      <span>{workout.dayLabel}</span>
                      {activeSession?.templateId === workout.id && <span className="active-pulse" style={{ display: 'inline-block', width: 7, height: 7 }} title="جلسه در حال انجام" />}
                      {workout.optional && <span className="optional-pill"><Sparkles size={12} /> اختیاری</span>}
                    </div>
                    <h3>{workout.name}</h3>
                    <p>{workout.focus}</p>
                  </div>
                  <Link to={`/workout/${workout.id}`} className={`button ${activeSession?.templateId === workout.id ? 'button--primary' : workout.optional ? 'button--secondary' : 'button--primary'} button--small`}>
                    {activeSession?.templateId === workout.id ? 'ادامهٔ جلسه' : 'شروع جلسه'} <ArrowRight size={15} />
                  </Link>
                </div>
                <p className="program-day__description">{workout.description}</p>
                <div className="program-day__meta"><span><Dumbbell size={14} /> {faNumber(exerciseCount)} حرکت · {faNumber(setCount)} ست</span><span><Clock3 size={14} /> حدود {faNumber(workout.durationMinutes)} دقیقه</span>{lastSession && <span className="program-day__last"><Check size={14} /> آخرین اجرا: {new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { month: 'short', day: 'numeric' }).format(new Date(lastSession.startedAt))}</span>}</div>
                <details className="program-exercise-details">
                  <summary>نمایش ترتیب حرکت‌ها <span>{faNumber(exerciseCount)} حرکت</span></summary>
                  <ol>{workout.exercises.map(({ exerciseId, name, prescription }, itemIndex) => {
                    const exercise = getExerciseGuide(exerciseId);
                    return <li key={`${exerciseId}-${itemIndex}`}>{exercise ? <Link to={`/exercise/${exerciseId}`}>{name}</Link> : <span>{name}</span>}<span>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</span></li>;
                  })}</ol>
                </details>
              </div>
            </article>
          );
        })}
      </div>

      <div className="program-rest-note"><span className="subtle-icon"><Info size={17} /></span><p><strong>استراحت هم بخشی از برنامه است.</strong> روز هفتم استراحت کن. جلسهٔ اختیاری را سبک نگه دار و اگر خواب، انرژی یا ریکاوری‌ات مناسب نیست، از آن بگذر.</p></div>

      {/* New Program / Template Selection Modal */}
      {showTemplateModal && (
        <div className="program-modal-backdrop" onClick={() => setShowTemplateModal(false)}>
          <div className="program-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-new-program-title">
            <div className="program-modal__header">
              <div>
                <h2 id="modal-new-program-title" className="program-modal__title">تعریف برنامهٔ تمرینی جدید</h2>
                <p className="program-modal__subtitle">یک الگوی استاندارد آماده انتخاب کنید یا از صفر شروع کنید:</p>
              </div>
              <button type="button" className="icon-button" aria-label="بستن پنجره" onClick={() => setShowTemplateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="template-grid">
              {presetTemplates.map((template) => (
                <div
                  key={template.id}
                  className="template-card"
                  onClick={() => void handleApplyTemplate(template)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void handleApplyTemplate(template); }}
                >
                  <div className="template-card__head">
                    <strong>{template.title}</strong>
                    <span className="template-card__badge">{template.badge}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{template.description}</p>
                  <div className="template-card__meta">
                    <span><Dumbbell size={13} /> {faNumber(template.daysCount)} روز تمرینی</span>
                    <span>·</span>
                    <span>{faNumber(template.exercisesCount)} حرکت تنظیم‌شده</span>
                    <span style={{ marginInlineStart: 'auto', color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      انتخاب این برنامه <ChevronLeft size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => {
                  setShowTemplateModal(false);
                  navigate('/program/edit');
                }}
              >
                <Pencil size={14} /> ورود مستقیم به ویرایشگر برنامه
              </button>
              <button type="button" className="button button--ghost button--small" onClick={() => setShowTemplateModal(false)}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Program Confirmation Modal */}
      {showDeleteModal && (
        <div className="program-modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="program-modal" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-delete-title">
            <div className="program-modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(242, 143, 130, 0.12)', color: 'var(--red)', display: 'grid', placeItems: 'center' }}>
                  <AlertTriangle size={20} />
                </div>
                <h2 id="modal-delete-title" className="program-modal__title">حذف کامل برنامهٔ تمرینی</h2>
              </div>
              <button type="button" className="icon-button" aria-label="بستن پنجره" onClick={() => setShowDeleteModal(false)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
              آیا از حذف این برنامه اطمینان دارید؟ تمام روزها و حرکت‌های برنامهٔ فعلی پاک خواهند شد. یک نسخهٔ پشتیبان برای بازیابی احتمالی نگه‌داری می‌شود.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button type="button" className="button button--ghost" onClick={() => setShowDeleteModal(false)} disabled={busy}>
                انصراف
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => void handleDeleteProgram()}
                disabled={busy}
              >
                <Trash2 size={16} /> {busy ? 'در حال حذف…' : 'بله، برنامه حذف شود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
