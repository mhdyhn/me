import { ArrowDown, ArrowLeft, ArrowUp, Plus, RotateCcw, Save, Trash2, Undo2, Sparkles, X, ChevronLeft, Dumbbell, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { exercises } from '../data/exercises';
import { hasExerciseFigure, exerciseFigureSrc } from '../data/exerciseFigures';
import {
  type LyftaCategory,
  lyftaCategoryLabels,
  exerciseLyftaCategory,
  lyftaCategoryFilters,
} from '../data/exerciseCategories';
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
  const [searchParams] = useSearchParams();
  const isBlankMode = searchParams.get('mode') === 'blank';

  const [draft, setDraft] = useState<WorkoutTemplate[]>(() => {
    if (isBlankMode) {
      return [
        {
          id: newId('custom-day'),
          name: 'روز ۱: شروع برنامه',
          dayLabel: 'روز ۰۱',
          focus: 'عضلات هدف',
          durationMinutes: 0,
          description: '',
          exercises: [],
        },
      ];
    }
    return structuredClone(saved);
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(() =>
    isBlankMode
      ? 'برنامهٔ جدید از صفر فعال شد. دسته‌بندی عضلانی مورد نظر را انتخاب و حرکت‌ها را اضافه کنید.'
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (isBlankMode) {
      setStatus('برنامهٔ جدید از صفر فعال شد. دسته‌بندی عضلانی مورد نظر را انتخاب و حرکت‌ها را اضافه کنید.');
    }
  }, [isBlankMode]);

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
    if (template.id === 'blank') {
      update([
        {
          id: newId('custom-day'),
          name: 'روز ۱: شروع برنامه',
          dayLabel: 'روز ۰۱',
          focus: 'عضلات هدف',
          durationMinutes: 0,
          description: '',
          exercises: [],
        },
      ]);
      setShowTemplateModal(false);
      setStatus('برنامهٔ جدید از صفر آماده شد. دسته‌بندی دلخواه را انتخاب کرده و حرکت‌ها را اضافه کنید.');
      return;
    }
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
        <div className="panel-card" style={{ padding: '28px 20px', textAlign: 'center', display: 'grid', gap: 14, placeItems: 'center' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.8 }}>
            برنامه در حال حاضر خالی است. می‌توانید روز اضافه کنید یا از الگوهای آماده استفاده کنید.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="button button--primary button--small" onClick={() => setShowTemplateModal(true)}>
              <Sparkles size={14} /> انتخاب از الگوها
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
            {day.exercises.length === 0 && (
              <p className="muted" style={{ padding: '8px 0', fontSize: 13 }}>
                این روز هنوز حرکتی ندارد. از کادر زیر با دسته‌بندی عضلات یا جستجو حرکت‌های مورد نظرتان را اضافه کنید.
              </p>
            )}
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

          <CategorizedExercisePicker onAdd={(exercise) => addExercise(dayIndex, exercise)} />
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

function CategorizedExercisePicker({ onAdd }: { onAdd: (exercise: WorkoutExercise) => void }) {
  const [category, setCategory] = useState<LyftaCategory>('All');
  const [query, setQuery] = useState('');
  const [customName, setCustomName] = useState('');

  const matches = useMemo(() => {
    const needle = normalizePersianSearch(query.trim());
    return exercises.filter((exercise) => {
      const matchesCategory = category === 'All' || exerciseLyftaCategory[exercise.id] === category;
      if (!matchesCategory) return false;
      if (!needle) return true;
      const searchable = normalizePersianSearch([
        exercise.name,
        exercise.englishName ?? '',
        ...exercise.primaryMuscles,
        ...exercise.equipment,
      ].join(' '));
      return searchable.includes(needle);
    }).slice(0, 50);
  }, [category, query]);

  return (
    <div className="editor-picker-box">
      <div className="editor-picker-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dumbbell size={16} style={{ color: 'var(--accent)' }} />
          <strong>انتخاب حرکت از دسته‌بندی‌ها</strong>
        </div>
        <span className="library-result-count" style={{ fontSize: 11 }}>
          {faNumber(matches.length)} حرکت در دسترس
        </span>
      </div>

      {/* Category Chips */}
      <div className="chip-row" role="group" aria-label="دسته‌بندی عضلانی">
        {lyftaCategoryFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`chip${filter.id === category ? ' is-active' : ''}`}
            aria-pressed={filter.id === category}
            onClick={() => setCategory(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="picker__search"
          placeholder="جست‌وجوی حرکت با نام فارسی، انگلیسی (Bench, Squat, لت...) یا عضله"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ paddingInlineStart: 34, paddingInlineEnd: query ? 32 : 12 }}
        />
        <Search size={15} style={{ position: 'absolute', insetInlineStart: 12, color: 'var(--muted)', pointerEvents: 'none' }} />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="پاک کردن جستجو"
            style={{ position: 'absolute', insetInlineEnd: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Exercises List */}
      <ul className="editor-picker-list">
        {matches.map((exercise) => (
          <li key={exercise.id} className="editor-picker-item">
            <div className="editor-picker-item__media">
              {hasExerciseFigure(exercise.id) ? (
                <img
                  src={exerciseFigureSrc(exercise.id, 'start')}
                  alt=""
                  loading="lazy"
                  width={44}
                  height={44}
                  className="editor-picker-item__img"
                />
              ) : (
                <div className="editor-picker-item__placeholder">
                  <Dumbbell size={18} />
                </div>
              )}
            </div>
            <div className="editor-picker-item__info">
              <strong>{exercise.name}</strong>
              <div className="editor-picker-item__sub">
                {exercise.englishName && <span dir="ltr">{exercise.englishName}</span>}
                <span className="editor-picker-badge">{lyftaCategoryLabels[exerciseLyftaCategory[exercise.id] ?? 'All']}</span>
              </div>
            </div>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => onAdd(newExercise(exercise.id, exercise.name))}
            >
              <Plus size={14} /> افزودن به این روز
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="account-muted" style={{ padding: '16px 0', textAlign: 'center', display: 'block' }}>
            حرکتی با این مشخصات در دسته‌بندی «{lyftaCategoryLabels[category]}» یافت نشد. می‌توانید با جستجوی دیگر یا افزودن حرکت سفارشی ادامه دهید.
          </li>
        )}
      </ul>

      {/* Custom movement entry */}
      <div className="editor-custom-add">
        <label className="field-control" style={{ flex: '1 1 240px' }}>
          <span style={{ fontSize: 11 }}>یا افزودن حرکت سفارشی (نام دلخواه)</span>
          <input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="مثلاً: بارفیکس دست باز مچ برعکس"
          />
        </label>
        <button
          type="button"
          className="button button--ghost button--small"
          disabled={!customName.trim()}
          onClick={() => {
            onAdd(newExercise(newId('custom'), customName.trim()));
            setCustomName('');
          }}
          style={{ minHeight: 40 }}
        >
          <Plus size={14} /> افزودن حرکت سفارشی
        </button>
      </div>
    </div>
  );
}
