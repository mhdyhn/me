import { ArrowDown, ArrowLeft, ArrowUp, Plus, RotateCcw, Save, Trash2, Undo2, Sparkles, X, ChevronLeft, Dumbbell } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { exercises } from '../data/exercises';
import { normalizePersianSearch } from '../lib/labels';
import { finalizeProgram, newDay, newExercise, newId, validateProgram } from '../lib/programRules';
import { resetProgram, saveProgram } from '../lib/programPersistence';
import { originalProgramCopy, useProgram } from '../lib/programStore';
import { presetTemplates, type PresetTemplate } from '../lib/programTemplates';
import { faNumber } from '../lib/format';
import type { WorkoutExercise, WorkoutTemplate } from '../types';

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  if (item === undefined) return list;
  copy.splice(to, 0, item);
  return copy;
};

const numberValue = (raw: string) => (raw.trim() === '' ? NaN : Number(raw));

export function ProgramEditor() {
  const saved = useProgram();
  const [draft, setDraft] = useState<WorkoutTemplate[]>(() => structuredClone(saved));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const update = (next: WorkoutTemplate[]) => {
    setDraft(next);
    setStatus(null);
  };

  const patchDay = (dayIndex: number, patch: Partial<WorkoutTemplate>) =>
    update(draft.map((day, index) => (index === dayIndex ? { ...day, ...patch } : day)));

  const patchExercise = (dayIndex: number, exerciseIndex: number, patch: Partial<WorkoutExercise> | Partial<WorkoutExercise['prescription']>) =>
    update(draft.map((day, index) => {
      if (index !== dayIndex) return day;
      return {
        ...day,
        exercises: day.exercises.map((item, itemIndex) => {
          if (itemIndex !== exerciseIndex) return item;
          const isPrescription = Object.keys(patch).some((key) => ['sets', 'minReps', 'maxReps', 'restSeconds', 'note'].includes(key));
          if (!isPrescription) return { ...item, ...(patch as Partial<WorkoutExercise>) };
          return { ...item, prescription: { ...item.prescription, ...(patch as Partial<WorkoutExercise['prescription']>) } };
        }),
      };
    }));

  const addExercise = (dayIndex: number, exercise: WorkoutExercise) =>
    update(draft.map((day, index) => (index === dayIndex ? { ...day, exercises: [...day.exercises, exercise] } : day)));

  const removeExercise = (dayIndex: number, exerciseIndex: number) => {
    const day = draft[dayIndex];
    if (!day) return;
    const item = day.exercises[exerciseIndex];
    if (!item || !window.confirm(`«${item.name}» از این روز حذف شود؟`)) return;
    update(draft.map((d, index) => (index === dayIndex ? { ...d, exercises: d.exercises.filter((_, i) => i !== exerciseIndex) } : d)));
  };

  const deleteDay = (dayIndex: number) => {
    const day = draft[dayIndex];
    if (!day || !window.confirm(`«${day.name || 'این روز'}» با همهٔ حرکت‌هایش حذف شود؟`)) return;
    update(draft.filter((_, index) => index !== dayIndex));
  };

  const deleteAllDays = () => {
    if (!window.confirm('همهٔ روزها و حرکت‌های این برنامه حذف شوند؟')) return;
    update([]);
    setStatus('همهٔ روزها پاک شدند. با «افزودن روز» یا «الگوها و برنامه جدید» ادامه دهید.');
  };

  const applyTemplate = (template: PresetTemplate) => {
    update(template.buildWorkoutTemplates());
    setShowTemplateModal(false);
    setStatus(`الگوی «${template.title}» بارگذاری شد. پس از اعمال تغییرات، دکمهٔ «ذخیرهٔ برنامه» را بزنید.`);
  };

  const save = async () => {
    const finalized = finalizeProgram(draft);
    const problems = validateProgram(finalized);
    if (problems.length) {
      setErrors(problems);
      setStatus(null);
      return;
    }
    setBusy(true);
    try {
      await saveProgram(finalized);
      setDraft(structuredClone(finalized));
      setErrors([]);
      setStatus('برنامه ذخیره شد. از این لحظه همهٔ صفحه‌ها همین برنامه را نشان می‌دهند.');
    } catch (error) {
      setErrors([`ذخیرهٔ برنامه انجام نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`]);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setDraft(structuredClone(saved));
    setErrors([]);
    setStatus('تغییرات ذخیره‌نشده کنار گذاشته شد.');
  };

  const restoreOriginal = async () => {
    if (!window.confirm('برنامهٔ فعلی با برنامهٔ اصلی RAGE جایگزین شود؟ نسخهٔ فعلی به‌عنوان پشتیبان نگه داشته می‌شود.')) return;
    setBusy(true);
    try {
      await resetProgram();
      setDraft(originalProgramCopy());
      setErrors([]);
      setStatus('برنامهٔ اصلی RAGE بازگردانی شد.');
    } catch (error) {
      setErrors([`بازگردانی انجام نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack program-editor">
      <Link to="/program" className="text-link"><ArrowLeft size={14} /> بازگشت به برنامه</Link>
      <SectionHeading eyebrow="ویرایشگر برنامه" title="برنامهٔ خودت را بساز." description="روزها، حرکت‌ها، ست، تکرار و استراحت را تغییر بده. تغییرات فقط بعد از «ذخیره» اعمال می‌شوند." />

      <div className="program-editor__toolbar panel-card">
        <button type="button" className="button button--secondary button--small" onClick={() => update([...draft, newDay()])} disabled={busy}><Plus size={14} /> افزودن روز</button>
        <button type="button" className="button button--secondary button--small" onClick={() => setShowTemplateModal(true)} disabled={busy}><Sparkles size={14} /> الگوها و برنامه جدید</button>
        {draft.length > 0 && (
          <button type="button" className="button button--ghost button--small button--danger-text" onClick={deleteAllDays} disabled={busy}><Trash2 size={14} /> حذف کل روزها</button>
        )}
        <button type="button" className="button button--secondary button--small" onClick={discard} disabled={busy || !dirty}><Undo2 size={14} /> کنار گذاشتن تغییرات</button>
        <button type="button" className="button button--secondary button--small" onClick={() => void restoreOriginal()} disabled={busy}><RotateCcw size={14} /> بازگردانی برنامهٔ RAGE</button>
        <button type="button" className="button button--primary button--small" onClick={() => void save()} disabled={busy || !dirty}><Save size={14} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ برنامه'}</button>
        {dirty && <span className="field-hint">تغییرات ذخیره‌نشده داری.</span>}
      </div>

      {errors.length > 0 && (
        <div className="program-editor__errors panel-card" role="alert">
          <strong>برنامه ذخیره نشد:</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}
      {status && <p className="program-editor__status" role="status">{status}</p>}

      {draft.length === 0 && (
        <div className="panel-card" style={{ padding: '24px 20px', textAlign: 'center', display: 'grid', gap: 12, placeItems: 'center' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>برنامه در حال حاضر خالی است. می‌توانید روز اضافه کنید یا یک الگوی آماده بارگذاری کنید.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="button button--primary button--small" onClick={() => setShowTemplateModal(true)}>
              <Sparkles size={14} /> بارگذاری الگوی آماده
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => update([newDay()])}>
              <Plus size={14} /> افزودن روز اول
            </button>
          </div>
        </div>
      )}

      {draft.map((day, dayIndex) => (
        <section key={day.id} className="editor-day panel-card">
          <div className="editor-day__heading">
            <span className="eyebrow">روز {dayIndex + 1}</span>
            <div className="editor-day__actions">
              <button type="button" className="icon-button" aria-label="جابه‌جایی به بالا" onClick={() => update(moveItem(draft, dayIndex, dayIndex - 1))} disabled={dayIndex === 0}><ArrowUp size={14} /></button>
              <button type="button" className="icon-button" aria-label="جابه‌جایی به پایین" onClick={() => update(moveItem(draft, dayIndex, dayIndex + 1))} disabled={dayIndex === draft.length - 1}><ArrowDown size={14} /></button>
              <button type="button" className="icon-button" aria-label="حذف روز" onClick={() => deleteDay(dayIndex)}><Trash2 size={14} /></button>
            </div>
          </div>

          <div className="editor-grid">
            <label className="field-control"><span>نام روز</span><input value={day.name} onChange={(event) => patchDay(dayIndex, { name: event.target.value })} /></label>
            <label className="field-control"><span>عضلات هدف</span><input value={day.focus} onChange={(event) => patchDay(dayIndex, { focus: event.target.value })} /></label>
          </div>
          <label className="field-control"><span>توضیح و کاردیوی پایانی</span><textarea rows={2} value={day.description} onChange={(event) => patchDay(dayIndex, { description: event.target.value })} /></label>
          <label className="editor-check"><input type="checkbox" checked={Boolean(day.optional)} onChange={(event) => patchDay(dayIndex, { optional: event.target.checked })} /> روز اختیاری (در شمارش هفتگی و چرخهٔ جلسهٔ بعد نیست)</label>

          <div className="editor-exercises">
            {day.exercises.length === 0 && <p className="muted">هنوز حرکتی ندارد.</p>}
            {day.exercises.map((item, exerciseIndex) => {
              const p = item.prescription;
              return (
                <div key={`${item.exerciseId}-${exerciseIndex}`} className="editor-exercise">
                  <div className="editor-exercise__top">
                    <label className="field-control editor-exercise__name"><span>نام حرکت</span><input value={item.name} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { name: event.target.value })} /></label>
                    <div className="editor-day__actions">
                      <button type="button" className="icon-button" aria-label="بالا بردن حرکت" onClick={() => update(draft.map((d, i) => (i === dayIndex ? { ...d, exercises: moveItem(d.exercises, exerciseIndex, exerciseIndex - 1) } : d)))} disabled={exerciseIndex === 0}><ArrowUp size={14} /></button>
                      <button type="button" className="icon-button" aria-label="پایین بردن حرکت" onClick={() => update(draft.map((d, i) => (i === dayIndex ? { ...d, exercises: moveItem(d.exercises, exerciseIndex, exerciseIndex + 1) } : d)))} disabled={exerciseIndex === day.exercises.length - 1}><ArrowDown size={14} /></button>
                      <button type="button" className="icon-button" aria-label="حذف حرکت" onClick={() => removeExercise(dayIndex, exerciseIndex)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="editor-grid editor-grid--four">
                    <label className="field-control"><span>ست</span><input type="number" min={1} max={10} inputMode="numeric" value={Number.isNaN(p.sets) ? '' : p.sets} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { sets: numberValue(event.target.value) })} /></label>
                    <label className="field-control"><span>حداقل تکرار</span><input type="number" min={1} inputMode="numeric" value={Number.isNaN(p.minReps) ? '' : p.minReps} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { minReps: numberValue(event.target.value) })} /></label>
                    <label className="field-control"><span>حداکثر تکرار</span><input type="number" min={1} inputMode="numeric" value={Number.isNaN(p.maxReps) ? '' : p.maxReps} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { maxReps: numberValue(event.target.value) })} /></label>
                    <label className="field-control"><span>استراحت (ثانیه)</span><input type="number" min={0} max={900} inputMode="numeric" value={Number.isNaN(p.restSeconds) ? '' : p.restSeconds} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { restSeconds: numberValue(event.target.value) })} /></label>
                  </div>
                  <label className="field-control"><span>یادداشت (اختیاری)</span><input value={p.note ?? ''} onChange={(event) => patchExercise(dayIndex, exerciseIndex, { note: event.target.value || undefined })} /></label>
                </div>
              );
            })}
          </div>

          <AddExercise onAdd={(exercise) => addExercise(dayIndex, exercise)} />
        </section>
      ))}

      {/* Preset template modal for the editor */}
      {showTemplateModal && (
        <div className="program-modal-backdrop" onClick={() => setShowTemplateModal(false)}>
          <div className="program-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="editor-modal-template-title">
            <div className="program-modal__header">
              <div>
                <h2 id="editor-modal-template-title" className="program-modal__title">انتخاب الگوی برنامهٔ تمرینی</h2>
                <p className="program-modal__subtitle">با انتخاب هر الگو، روزها و حرکت‌های آن در پیش‌نویس بارگذاری می‌شوند:</p>
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
                  onClick={() => applyTemplate(template)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') applyTemplate(template); }}
                >
                  <div className="template-card__head">
                    <strong>{template.title}</strong>
                    <span className="template-card__badge">{template.badge}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{template.description}</p>
                  <div className="template-card__meta">
                    <span><Dumbbell size={13} /> {faNumber(template.daysCount)} روز</span>
                    <span>·</span>
                    <span>{faNumber(template.exercisesCount)} حرکت</span>
                    <span style={{ marginInlineStart: 'auto', color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      بارگذاری در ویرایشگر <ChevronLeft size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--line-soft)' }}>
              <button type="button" className="button button--ghost button--small" onClick={() => setShowTemplateModal(false)}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddExercise({ onAdd }: { onAdd: (exercise: WorkoutExercise) => void }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [customName, setCustomName] = useState('');

  const matches = useMemo(() => {
    const needle = normalizePersianSearch(query);
    return exercises
      .filter((exercise) => normalizePersianSearch(exercise.name).includes(needle))
      .slice(0, 40);
  }, [query]);

  const selected = exercises.find((exercise) => exercise.id === selectedId);

  return (
    <div className="editor-add">
      <div className="editor-grid">
        <label className="field-control"><span>جستجوی حرکت از کتابخانه</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً پرس، جلو بازو…" /></label>
        <label className="field-control"><span>انتخاب حرکت</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">— یک حرکت را انتخاب کن —</option>
            {matches.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="button button--secondary button--small"
        disabled={!selected}
        onClick={() => {
          if (!selected) return;
          onAdd(newExercise(selected.id, selected.name));
          setSelectedId('');
        }}
      ><Plus size={14} /> افزودن از کتابخانه</button>

      <div className="editor-grid">
        <label className="field-control"><span>حرکت سفارشی (نام آزاد)</span><input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
      </div>
      <button
        type="button"
        className="button button--secondary button--small"
        disabled={!customName.trim()}
        onClick={() => {
          onAdd(newExercise(newId('custom'), customName.trim()));
          setCustomName('');
        }}
      ><Plus size={14} /> افزودن حرکت سفارشی</button>
    </div>
  );
}
