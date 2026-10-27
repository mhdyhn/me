import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, ChevronLeft, Dumbbell, Plus, Save, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { PaymentPractice } from '../../components/PaymentPractice';
import { exercises as catalog } from '../../data/exercises';
import { exerciseSearchText } from '../../data/exerciseCategories';
import { matchesPersianSearch } from '../../lib/labels';
import { ApiError, api, type ProgramDay, type ProgramItem, type Programme, type PublicUser } from '../../lib/api';
import { presetTemplates, type PresetTemplate } from '../../lib/programTemplates';
import { faNumber } from '../../lib/format';
import { PanelPage, RequireRole } from './AccountShell';
import { isValidReps, normalizeReps } from '../../../shared/repetitions';

const MAX_DAYS = 7;
const MAX_EXERCISES = 15;
const muscleOptions = ['همه', ...new Set(catalog.flatMap((exercise) => exercise.primaryMuscles))];

export function ProgramBuilder() {
  return (
    <RequireRole roles={['coach', 'admin']}>
      <Builder />
    </RequireRole>
  );
}

function Builder() {
  const { studentId } = useParams();
  const id = Number(studentId);
  const [student, setStudent] = useState<PublicUser | null>(null);
  const [title, setTitle] = useState('');
  const [priceTomans, setPriceTomans] = useState(0);
  const [currentProgram, setCurrentProgram] = useState<Programme | null>(null);
  const [saveMode, setSaveMode] = useState<'edit' | 'new'>('new');
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [muscle, setMuscle] = useState('همه');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseResultLimit, setExerciseResultLimit] = useState(12);
  const [limitations, setLimitations] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [progRes, biometricsResult] = await Promise.all([
          api<{ program: Programme | null; student?: PublicUser }>('GET', `/students/${id}/program`),
          api<{ biometrics: { limitations?: string } }>('GET', `/students/${id}/ai-settings`).catch(() => ({ biometrics: { limitations: '' } })),
        ]);
        if (cancelled) return;
        if (progRes.student) {
          setStudent(progRes.student);
        } else {
          const list = await api<{ students: PublicUser[] }>('GET', '/students').catch(() => ({ students: [] }));
          setStudent(list.students.find((candidate) => candidate.id === id) ?? null);
        }
        if (progRes.program) {
          setCurrentProgram(progRes.program);
          setSaveMode('edit');
          setTitle(progRes.program.title);
          setPriceTomans(progRes.program.priceTomans ?? 0);
          setDays(progRes.program.days);
        } else {
          setCurrentProgram(null);
          setSaveMode('new');
        }
        if (biometricsResult?.biometrics?.limitations) {
          setLimitations(biometricsResult.biometrics.limitations);
        }
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'برنامه بارگذاری نشد.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadAttempt]);

  const matchingExercises = useMemo(() => {
    const query = search.trim();
    if (!query) {
      return catalog.filter((exercise) => muscle === 'همه' || exercise.primaryMuscles.includes(muscle));
    }
    const withinMuscle = muscle === 'همه' ? [] : catalog.filter((exercise) => {
      if (!exercise.primaryMuscles.includes(muscle)) return false;
      return matchesPersianSearch(exerciseSearchText(exercise), query);
    });
    if (withinMuscle.length > 0) return withinMuscle;

    return catalog.filter((exercise) => matchesPersianSearch(exerciseSearchText(exercise), query));
  }, [muscle, search]);
  const visibleExercises = matchingExercises.slice(0, exerciseResultLimit);

  function updateDays(next: ProgramDay[]) {
    setMessage(null);
    setSaveError(null);
    setDays(next);
  }

  function addDay() {
    if (days.length >= MAX_DAYS) return;
    updateDays([...days, { name: `روز ${days.length + 1}`, exercises: [] }]);
    setActiveDay(days.length);
    setShowExercisePicker(false);
  }

  async function removeDay(index: number) {
    const target = days[index];
    if (!target) return;
    const ok = await confirmModal({
      title: 'حذف روز از برنامه',
      message: `«${target.name}» و همهٔ حرکت‌هایش از برنامه حذف شوند؟`,
      confirmText: 'حذف روز',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    updateDays(days.filter((_, position) => position !== index));
    setActiveDay(0);
    setShowExercisePicker(false);
  }

  /** Swaps an entry with its neighbour. Used for both days and exercises. */
  function swap<T>(list: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  }

  function moveDay(index: number, direction: -1 | 1) {
    const next = swap(days, index, direction);
    if (next === days) return;
    updateDays(next);
    setActiveDay(index + direction);
  }

  function moveItem(dayIndex: number, itemIndex: number, direction: -1 | 1) {
    updateDays(days.map((day, position) => (position === dayIndex ? { ...day, exercises: swap(day.exercises, itemIndex, direction) } : day)));
  }

  function renameDay(index: number, name: string) {
    updateDays(days.map((day, position) => (position === index ? { ...day, name } : day)));
  }

  function addExercise(exercise: (typeof catalog)[number]) {
    const day = days[activeDay];
    if (!day) return setSaveError('ابتدا یک روز اضافه کنید.');
    if (day.exercises.length >= MAX_EXERCISES) return setSaveError(`هر روز حداکثر ${MAX_EXERCISES} حرکت دارد.`);
    const primaryMuscle = exercise.primaryMuscles[0] || (muscle !== 'همه' ? muscle : 'عمومی');
    const item: ProgramItem = { exerciseId: exercise.id, name: exercise.name, muscle: primaryMuscle, sets: 3, reps: '8-12', restSeconds: 90 };
    updateDays(days.map((current, position) => (position === activeDay ? { ...current, exercises: [...current.exercises, item] } : current)));
  }

  function editItem(dayIndex: number, itemIndex: number, patch: Partial<ProgramItem>) {
    updateDays(
      days.map((day, position) =>
        position === dayIndex
          ? { ...day, exercises: day.exercises.map((item, index) => (index === itemIndex ? { ...item, ...patch } : item)) }
          : day,
      ),
    );
  }

  function removeItem(dayIndex: number, itemIndex: number) {
    updateDays(days.map((day, position) => (position === dayIndex ? { ...day, exercises: day.exercises.filter((_, index) => index !== itemIndex) } : day)));
  }

  function validate(): string | null {
    if (title.trim().length < 2) return 'عنوان برنامه را وارد کنید.';
    if (days.length === 0) return 'حداقل یک روز اضافه کنید.';
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      if (!day) continue;
      if (!day.name.trim()) return `نام روز ${faNumber(d + 1)} را وارد کنید.`;
      if (day.name.trim().length > 80) return `نام روز ${faNumber(d + 1)} نباید بیشتر از ۸۰ نویسه باشد.`;
      if (day.exercises.length === 0) return `«${day.name}» هنوز حرکتی ندارد.`;
      for (const item of day.exercises) {
        if (!Number.isInteger(item.sets) || item.sets < 1 || item.sets > 10) return `تعداد ست «${item.name}» باید بین ۱ تا ۱۰ باشد.`;
        const reps = normalizeReps(item.reps);
        if (!isValidReps(reps)) return `تکرار «${item.name}» باید بین ۱ تا ۹۹ و مثل ۸ یا ۸-۱۲ باشد.`;
        if (!Number.isInteger(item.restSeconds) || item.restSeconds < 0 || item.restSeconds > 600) return `استراحت «${item.name}» باید بین ۰ تا ۶۰۰ ثانیه باشد.`;
      }
    }
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) return setSaveError(problem);
    if (currentProgram && (!currentProgram.id || !Number.isInteger(currentProgram.version))) {
      return setSaveError('سرور از شناسهٔ برنامه پشتیبانی نمی‌کند. پس از به‌روزرسانی سرور دوباره تلاش کنید.');
    }
    if (currentProgram && saveMode === 'new') {
      const confirmed = await confirmModal({
        title: 'ثبت برنامهٔ جدید',
        message: priceTomans > 0
          ? 'این یک برنامهٔ جدید و خرید جداگانه است. برنامهٔ قبلی در بایگانی شاگرد حفظ می‌شود. ادامه می‌دهید؟'
          : 'این یک برنامهٔ جدید و رایگان است. برنامهٔ قبلی در بایگانی شاگرد حفظ می‌شود. ادامه می‌دهید؟',
        confirmText: 'ثبت برنامهٔ جدید',
        cancelText: 'انصراف',
      });
      if (!confirmed) return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const cleanDays = days.map((day) => ({
        ...day,
        name: day.name.trim(),
        exercises: day.exercises.map((item) => ({
          ...item,
          name: item.name.trim(),
          muscle: item.muscle?.trim() || 'عمومی',
          reps: normalizeReps(item.reps),
        })),
      }));
      const result = await api<{ program: Programme }>('PUT', `/students/${id}/program`, {
        title: title.trim(), days: cleanDays, priceTomans,
        saveMode: currentProgram ? saveMode : 'new',
        expectedId: currentProgram?.id ?? null,
        expectedVersion: currentProgram?.version ?? 0,
      });
      setCurrentProgram(result.program);
      setSaveMode('edit');
      setMessage('برنامه ذخیره شد. شاگرد همین حالا وضعیت آن را می‌بیند.');
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'برنامه ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProgram() {
    if (!currentProgram?.id || !Number.isInteger(currentProgram.version)) {
      return setSaveError('ابتدا برنامهٔ فعلی را دوباره بارگذاری کنید.');
    }
    const studentName = student ? student.displayName : 'این شاگرد';
    const ok = await confirmModal({
      title: 'برداشتن برنامهٔ فعال',
      message: `برنامهٔ فعال ${studentName} برداشته شود؟ برنامه‌های خریداری‌شده در بایگانی شاگرد حفظ می‌شوند.`,
      confirmText: 'برداشتن برنامه',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api('DELETE', `/students/${id}/program`, { expectedId: currentProgram.id, expectedVersion: currentProgram.version });
      setCurrentProgram(null);
      setSaveMode('new');
      setTitle('');
      setPriceTomans(0);
      setDays([]);
      setActiveDay(0);
      setMessage('برنامهٔ فعال برداشته شد؛ برنامه‌های خریداری‌شده در بایگانی شاگرد باقی می‌مانند.');
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'برنامه حذف نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  function loadTemplate(template: PresetTemplate) {
    setTitle(template.title);
    setDays(template.buildProgramDays());
    setActiveDay(0);
    setShowTemplateModal(false);
    setShowExercisePicker(false);
    setMessage(`الگوی «${template.title}» بارگذاری شد. تغییرات را اعمال کرده و ذخیره نمایید.`);
  }

  if (loading) return <PanelPage title="ساخت برنامه"><p className="account-muted">در حال بارگذاری…</p></PanelPage>;
  if (loadError) return (
    <PanelPage title="ساخت برنامه">
      <div className="account-load-error" role="alert">
        <p>{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          تلاش دوباره برای بارگذاری برنامه
        </button>
      </div>
    </PanelPage>
  );

  return (
    <PanelPage title={student ? `برنامهٔ ${student.displayName}` : 'برنامه'}>
      <Link className="back-link" to="/coach"><ArrowRight size={16} /> شاگردها</Link>

      <section className="builder-section">
        <div className="builder-program-basics">
          <label className="field">
            <span>عنوان برنامه</span>
            <input value={title} onChange={(event) => { setTitle(event.target.value); setMessage(null); }} maxLength={80} placeholder="مثلاً برنامهٔ سه روزه قدرتی" />
          </label>
          <details className="program-price-disclosure">
            <summary>
              <span className="program-price-disclosure__title">تنظیمات قیمت</span>
              <span className="program-price-disclosure__value">{priceTomans > 0 ? `${faNumber(priceTomans)} تومان` : 'رایگان'}</span>
            </summary>
            <div className="program-price-disclosure__content">
              <label className="field">
                <span>هزینهٔ برنامه (تومان)</span>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={priceTomans || ''}
                  onChange={(event) => {
                    setPriceTomans(Math.max(0, parseInt(event.target.value) || 0));
                    setMessage(null);
                  }}
                  placeholder="۰ برای برنامهٔ رایگان"
                />
              </label>
              {priceTomans > 0 && (
                <div className="program-price-share">
                  <p>محاسبهٔ نمونه با نسبت ۹۰ به ۱۰؛ نسبت واقعی به تنظیمات سرور بستگی دارد.</p>
                  <div><span>سهم مربی · ۹۰٪</span><strong>{Math.floor(priceTomans * 0.9).toLocaleString('fa-IR')} تومان</strong></div>
                  <div><span>سهم مدیر · ۱۰٪</span><strong>{(priceTomans - Math.floor(priceTomans * 0.9)).toLocaleString('fa-IR')} تومان</strong></div>
                </div>
              )}
            </div>
          </details>
        </div>
        <PaymentPractice program={currentProgram} studentId={id} />

        {limitations && limitations.trim().length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid rgba(239, 68, 68, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '13px', color: '#ef4444' }}>
                <strong>ملاحظات ارتوپدی و آسیب‌های ثبت‌شده شاگرد: </strong>{limitations}
              </span>
            </div>
            <Link to={`/coach/students/${id}/ai`} className="text-link text-xs">
              ویرایش بیومتریک و پایش
            </Link>
          </div>
        )}
      </section>

      <section className="builder-section">
          <div className="builder-section__head">
          <h2>روزها</h2>
          <div className="builder-section__actions">
            <button type="button" className="button button--ghost" onClick={() => setShowTemplateModal(true)}>
              <Sparkles size={16} /> الگوهای آماده
            </button>
            <button type="button" className="button button--secondary" onClick={addDay} disabled={days.length >= MAX_DAYS}>
              <Plus size={16} /> روز جدید
            </button>
          </div>
        </div>
        {days.length === 0 && <p className="account-muted">هنوز روزی نساخته‌اید. با «روز جدید» شروع کنید.</p>}
        <div className="day-tabs" role="tablist">
          {days.map((day, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              title={day.name || `روز ${index + 1}`}
              aria-selected={index === activeDay}
              className={`day-tab${index === activeDay ? ' is-active' : ''}`}
              onClick={() => setActiveDay(index)}
            >
              {day.name || `روز ${index + 1}`} <small>({day.exercises.length})</small>
            </button>
          ))}
        </div>

        {days[activeDay] && (
          <div className="day-editor">
            <div className="day-editor__head">
              <input className="day-editor__name" aria-label="نام روز" value={days[activeDay].name} maxLength={80} onChange={(event) => renameDay(activeDay, event.target.value)} />
              <div className="day-editor__actions">
                <div className="order-buttons">
                  <button type="button" className="icon-button" aria-label="جابه‌جایی روز به بالا" disabled={activeDay === 0} onClick={() => moveDay(activeDay, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className="icon-button" aria-label="جابه‌جایی روز به پایین" disabled={activeDay >= days.length - 1} onClick={() => moveDay(activeDay, 1)}>
                    <ArrowDown size={16} />
                  </button>
                </div>
                <button type="button" className="button button--ghost" onClick={() => removeDay(activeDay)}>
                  <Trash2 size={16} /> حذف روز
                </button>
              </div>
            </div>

            {days[activeDay].exercises.length === 0 && <p className="account-muted">این روز هنوز حرکتی ندارد. از فهرست پایین حرکت اضافه کنید.</p>}
            <ul className="item-list">
              {days[activeDay].exercises.map((item, itemIndex) => (
                <li key={`${item.exerciseId}-${itemIndex}`} className="item-row">
                  <div className="item-row__name">
                    <strong>{item.name}</strong>
                    <span className="account-muted">{item.muscle} · {faNumber(item.sets)} ست · {item.reps} تکرار · {faNumber(item.restSeconds)} ثانیه استراحت</span>
                  </div>
                  <details className="item-row__settings">
                    <summary>تنظیمات</summary>
                    <div className="item-row__fields">
                      <label className="mini-field">
                        <span>ست</span>
                        <input type="number" min={1} max={10} value={item.sets} onChange={(event) => editItem(activeDay, itemIndex, { sets: Number(event.target.value) })} />
                      </label>
                      <label className="mini-field">
                        <span>تکرار</span>
                        <input dir="ltr" value={item.reps} maxLength={12} onChange={(event) => editItem(activeDay, itemIndex, { reps: event.target.value })} />
                      </label>
                      <label className="mini-field">
                        <span>استراحت · ثانیه</span>
                        <input type="number" min={0} max={600} step={15} value={item.restSeconds} onChange={(event) => editItem(activeDay, itemIndex, { restSeconds: Number(event.target.value) })} />
                      </label>
                    </div>
                  </details>
                  <div className="order-buttons">
                    <button type="button" className="icon-button" aria-label={`بالاتر بردن ${item.name}`} disabled={itemIndex === 0} onClick={() => moveItem(activeDay, itemIndex, -1)}>
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" className="icon-button" aria-label={`پایین بردن ${item.name}`} disabled={itemIndex >= (days[activeDay]?.exercises.length ?? 0) - 1} onClick={() => moveItem(activeDay, itemIndex, 1)}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <button type="button" className="icon-button" aria-label={`حذف ${item.name}`} onClick={() => removeItem(activeDay, itemIndex)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>

            <section className={`picker${showExercisePicker ? ' picker--open' : ''}`}>
              <div className="picker__head">
                <div>
                  <h3>حرکت‌های این روز</h3>
                  <p className="account-muted">حرکت‌ها را جست‌وجو کن؛ تنظیمات هر حرکت جداگانه باز می‌شود.</p>
                </div>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  aria-expanded={showExercisePicker}
                  onClick={() => setShowExercisePicker((open) => !open)}
                >
                  {showExercisePicker ? <X size={15} /> : <Plus size={15} />}
                  {showExercisePicker ? 'بستن فهرست' : 'افزودن حرکت'}
                </button>
              </div>
              {showExercisePicker && (
                <div className="picker__content">
                  <div className="picker__filters">
                    <input className="picker__search" aria-label="جست‌وجوی حرکت با نام فارسی، انگلیسی یا نام حرکت" placeholder="نام حرکت را بنویس؛ مثل اسکوات اسمیت" value={search} onChange={(event) => { setSearch(event.target.value); setExerciseResultLimit(12); }} />
                    <label className="field picker__muscle-filter">
                      <span>گروه عضلانی</span>
                      <select aria-label="گروه عضلانی" value={muscle} onChange={(event) => { setMuscle(event.target.value); setExerciseResultLimit(12); }}>
                        {muscleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="picker__hint">نمایش {faNumber(visibleExercises.length)} از {faNumber(matchingExercises.length)} نتیجه</p>
                  <ul className="picker-list">
                    {visibleExercises.map((exercise) => (
                      <li key={exercise.id}>
                        <div>
                          <strong>{exercise.name}</strong>
                          {exercise.englishName && <div className="account-muted" style={{ fontSize: 11 }} dir="ltr">{exercise.englishName}</div>}
                        </div>
                        <button type="button" className="button button--ghost" onClick={() => addExercise(exercise)}>
                          <Plus size={16} /> افزودن
                        </button>
                      </li>
                    ))}
                    {visibleExercises.length === 0 && <li className="account-muted">حرکتی پیدا نشد.</li>}
                  </ul>
                  {matchingExercises.length > visibleExercises.length && (
                    <button type="button" className="button button--ghost button--small picker__more" onClick={() => setExerciseResultLimit((limit) => limit + 12)}>
                      نمایش حرکت‌های بیشتر ({faNumber(matchingExercises.length - visibleExercises.length)} باقی‌مانده)
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {currentProgram && (
        <fieldset className="builder-save-mode">
          <legend>نوع ذخیره</legend>
          <label>
            <input type="radio" name="programme-save-mode" checked={saveMode === 'edit'} onChange={() => setSaveMode('edit')} />
            <span><strong>ویرایش برنامهٔ فعلی</strong><small>خریدار قبلی دوباره هزینه نمی‌دهد.</small></span>
          </label>
          <label>
            <input type="radio" name="programme-save-mode" checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />
            <span><strong>ثبت برنامهٔ جدید</strong><small>برنامهٔ جدید با قیمت خودش جداگانه فروخته می‌شود.</small></span>
          </label>
        </fieldset>
      )}
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      <div className="builder-save" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>
          <Save size={16} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ برنامه'}
        </button>
        {currentProgram && (
          <button type="button" className="button button--ghost button--danger-text" onClick={() => void deleteProgram()} disabled={saving}>
            <Trash2 size={16} /> برداشتن برنامهٔ فعال
          </button>
        )}
      </div>

      {showTemplateModal && (
        <div className="program-modal-backdrop" onClick={() => setShowTemplateModal(false)}>
          <div className="program-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="builder-modal-template-title">
            <div className="program-modal__header">
              <div>
                <h2 id="builder-modal-template-title" className="program-modal__title">انتخاب الگوی برنامه</h2>
                <p className="program-modal__subtitle">الگوی مورد نظر را انتخاب کنید تا برای این شاگرد تنظیم شود:</p>
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
                  onClick={() => loadTemplate(template)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') loadTemplate(template); }}
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
                      بارگذاری در برنامه <ChevronLeft size={14} />
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
    </PanelPage>
  );
}
