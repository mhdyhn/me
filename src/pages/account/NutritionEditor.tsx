import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, ListOrdered, Save } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import { DraftConflictNotice } from '../../components/DraftConflictNotice';
import { PersianDateInput } from '../../components/PersianDateInput';
import { PlanConflictPreview } from '../../components/NutritionConflictPreview';
import { SessionDraftRecovery, SessionDraftStatus } from '../../components/SessionDraftNotice';
import { useSessionDraft } from '../../components/useSessionDraft';
import { samePersonalValue } from '../../lib/draftGuard';
import { isDiaryResponse } from '../../lib/responseGuards';
import { isUncertainWrite } from '../../lib/writeOutcome';
import { ApiError, api, type PublicUser } from '../../lib/api';
import { faNumber, formatDate, getLocalDateKey } from '../../lib/format';
import {
  dayTotals,
  itemTotals,
  mealTotals,
  roundTotals,
  todayDayIndex,
  type NutritionPlan,
  type PlanDay,
  type PlanMeal,
  type Targets,
  FOODS_BY_ID,
  MAX_GRAMS,
} from '../../lib/nutrition';
import { RequireRole, PanelPage } from './AccountShell';
import { TargetBars, TotalsStrip } from './NutritionParts';
import { MealsEditor, dayItems } from './MealsEditor';

const EMPTY_DRAFT_PLAN: NutritionPlan = { targets: { kcal: null, proteinG: null, carbsG: null, fatG: null }, days: [], updatedAt: null };
const planContent = (plan: NutritionPlan) => ({ targets: plan.targets, days: plan.days });

function isNutritionDraft(value: unknown): value is NutritionPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as NutritionPlan;
  if (!plan.targets || !Array.isArray(plan.days) || plan.days.length !== 7
    || (plan.updatedAt !== null && typeof plan.updatedAt !== 'string')) return false;
  if (!(['kcal', 'proteinG', 'carbsG', 'fatG'] as const).every((key) => plan.targets[key] === null || typeof plan.targets[key] === 'number')) return false;
  return plan.days.every((day) => day && typeof day.name === 'string' && Array.isArray(day.meals)
    && day.meals.every((meal) => meal && typeof meal.name === 'string' && Array.isArray(meal.items)
      && meal.items.every((item) => item && typeof item.foodId === 'string' && typeof item.grams === 'number')));
}

/** The coach's editor for one student's weekly nutrition plan. Saved as a whole, after each change is checked by the server. */
export function NutritionEditor() {
  const { studentId } = useParams();
  const { user } = useSession();
  return (
    <RequireRole roles={['coach']}>
      {user && <NutritionEditorScreen key={`${user.id}:${studentId}`} userId={user.id} />}
    </RequireRole>
  );
}

function NutritionEditorScreen({ userId }: { userId: number }) {
  const { studentId } = useParams();
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [baseline, setBaseline] = useState<NutritionPlan | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(todayDayIndex());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [needsLatest, setNeedsLatest] = useState(false);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [latestPlan, setLatestPlan] = useState<NutritionPlan | null>(null);

  // Coach can switch between editing the weekly plan and viewing the student's logged meal diary
  const [viewMode, setViewMode] = useState<'plan' | 'diary'>('plan');
  const [diaryDate, setDiaryDate] = useState(getLocalDateKey());
  const [diaryData, setDiaryData] = useState<{ day: string; meals: PlanMeal[]; updatedAt: string | null } | null>(null);
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [diaryError, setDiaryError] = useState<string | null>(null);
  const [diaryAttempt, setDiaryAttempt] = useState(0);
  const planPath = `/students/${studentId}/nutrition`;
  const boundPlanPath = `${planPath}?accountId=${userId}`;
  const recovery = useSessionDraft(`meety:session-draft:coach-nutrition:${userId}:${studentId}`,
    baseline ?? EMPTY_DRAFT_PLAN, plan ?? EMPTY_DRAFT_PLAN, dirty || needsLatest,
    !!plan && !!baseline && !loadError, isNutritionDraft);

  useEffect(() => {
    let cancelled = false;
    setPlan(null); setLoadError(null);
    (async () => {
      try {
        const [planResult, studentsResult] = await Promise.all([
          api<{ plan: NutritionPlan }>('GET', boundPlanPath),
          api<{ students: (PublicUser & { password: string | null })[] }>('GET', '/students'),
        ]);
        if (cancelled) return;
        if (!isNutritionDraft(planResult.plan) || !Array.isArray(studentsResult.students)) throw new ApiError(200, 'پاسخ برنامهٔ غذایی نامعتبر است.');
        setPlan(planResult.plan); setBaseline(planResult.plan); setDirty(false); setNeedsLatest(false); setLatestPlan(null);
        setStudentName(studentsResult.students.find((s) => String(s.id) === studentId)?.displayName ?? null);
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'برنامهٔ غذایی بارگذاری نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boundPlanPath, studentId, loadAttempt]);

  useEffect(() => {
    if (viewMode !== 'diary') return;
    let cancelled = false;
    setDiaryLoading(true); setDiaryData(null); setDiaryError(null);
    api<{ studentName: string; diary: { day: string; meals: PlanMeal[]; updatedAt: string | null } }>(
      'GET',
      `/students/${studentId}/diary/${diaryDate}?accountId=${userId}`,
    )
      .then((res) => {
        if (!cancelled) {
          if (!isDiaryResponse(res.diary, diaryDate)) throw new ApiError(200, 'پاسخ دفتر خوراک نامعتبر است.');
          setDiaryData(res.diary);
        }
      })
      .catch((caught) => {
        if (!cancelled) setDiaryError(caught instanceof ApiError ? caught.message : 'دفتر خوراک شاگرد بارگذاری نشد.');
      })
      .finally(() => {
        if (!cancelled) setDiaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, studentId, userId, diaryDate, diaryAttempt]);

  function update(next: NutritionPlan) {
    setPlan(next);
    setDirty(true);
    setSaved(false);
    setSaveError(null);
  }

  function setTarget(key: keyof Targets, raw: string) {
    if (!plan) return;
    const value = raw.trim() === '' ? null : Number(raw);
    update({ ...plan, targets: { ...plan.targets, [key]: value === null || Number.isFinite(value) ? value : plan.targets[key] } });
  }

  function updateDay(index: number, change: (day: PlanDay) => PlanDay) {
    if (!plan) return;
    update({ ...plan, days: plan.days.map((day, i) => (i === index ? change(day) : day)) });
  }

  async function checkLatest(submitted?: NutritionPlan) {
    setCheckingLatest(true);
    try {
      const result = await api<{ plan: NutritionPlan }>('GET', boundPlanPath);
      if (!isNutritionDraft(result.plan)) throw new ApiError(200, 'پاسخ برنامهٔ غذایی نامعتبر است.');
      if (submitted && samePersonalValue(planContent(result.plan), planContent(submitted))) {
        setPlan(result.plan); setBaseline(result.plan); setDirty(false); setSaved(true);
        setNeedsLatest(false); setLatestPlan(null); setSaveError(null);
      } else {
        setLatestPlan(result.plan); setSaveError(null);
      }
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'دریافت نسخهٔ تازه ممکن نشد. پیش‌نویس حفظ شده است.');
    } finally { setCheckingLatest(false); }
  }

  async function save() {
    if (!plan || !baseline || savingRef.current || needsLatest) return;
    const problem = findProblem(plan);
    if (problem) { setSaveError(problem); return; }
    savingRef.current = true; setSaving(true); setSaveError(null);
    try {
      const body = { accountId: userId, targets: plan.targets, days: plan.days.map(({ meals }) => ({ meals })), expectedPlan: baseline };
      const result = await api<{ plan: NutritionPlan }>('PUT', planPath, body);
      if (!isNutritionDraft(result.plan)) throw new ApiError(200, 'پاسخ ذخیرهٔ برنامهٔ غذایی نامعتبر است.');
      setPlan(result.plan); setBaseline(result.plan); setDirty(false); setSaved(true);
    } catch (caught) {
      if (isUncertainWrite(caught)) {
        setNeedsLatest(true); setSaved(false);
        await checkLatest(plan);
      } else setSaveError(caught instanceof ApiError ? caught.message : 'پاسخ ذخیره دریافت نشد؛ پیش‌نویس را نگه دارید و دوباره بررسی کنید.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  if (loadError) {
    return (
      <PanelPage title="برنامهٔ غذایی">
        <p className="form-error" role="alert">{loadError}</p>
        <button type="button" className="button button--secondary button--small" onClick={() => setLoadAttempt((value) => value + 1)}>تلاش دوباره برای بارگذاری برنامه</button>
        <Link className="button button--ghost" to="/coach"><ArrowRight size={16} /> بازگشت به شاگردها</Link>
      </PanelPage>
    );
  }
  if (!plan) {
    return (
      <PanelPage title="برنامهٔ غذایی">
        <p className="account-muted">در حال بارگذاری…</p>
      </PanelPage>
    );
  }

  if (recovery.pending) return <PanelPage title={studentName ? `تغذیهٔ ${studentName}` : 'تغذیهٔ شاگرد'}>
    <Link className="chat-back" to="/coach"><ArrowLeft size={16} /> همهٔ شاگردها</Link>
    {recovery.recovery.kind === 'empty' ? <p className="account-muted">در حال بررسی پیش‌نویس…</p> :
      <SessionDraftRecovery invalid={recovery.recovery.kind === 'invalid'} onRestore={() => {
        const record = recovery.restore();
        if (!record || !baseline) return;
        const different = !samePersonalValue(planContent(record.base), planContent(baseline));
        setPlan(record.draft); setBaseline(different ? record.base : baseline); setDirty(true); setSaved(false);
        if (different) { setLatestPlan(baseline); setNeedsLatest(true); }
      }} onDiscard={recovery.discard} />}
  </PanelPage>;

  const day = plan.days[dayIndex] as PlanDay;
  const dayTotal = dayTotals(day);
  const diaryDayTotal = diaryData ? dayTotals({ name: diaryData.day, meals: diaryData.meals }) : null;

  return (
    <PanelPage title={studentName ? `تغذیهٔ ${studentName}` : 'تغذیهٔ شاگرد'}>
      <Link className="chat-back" to="/coach"><ArrowLeft size={16} /> همهٔ شاگردها</Link>
      <SessionDraftStatus dirty={dirty || needsLatest} storage={recovery.storage} />
      {needsLatest && latestPlan && <DraftConflictNotice latest={latestPlan} preview={<PlanConflictPreview plan={latestPlan} />}
        discard={() => { setPlan(latestPlan); setBaseline(latestPlan); setLatestPlan(null); setNeedsLatest(false); setDirty(false); setSaved(false); }}
        acceptCurrent={() => { setBaseline(latestPlan); setLatestPlan(null); setNeedsLatest(false); setDirty(true); setSaved(false); }} />}
      {needsLatest && !latestPlan && <div className="account-load-error" role="alert">
        <p>وضعیت ذخیره یا نسخهٔ تازه روشن نیست؛ پیش‌نویس شما حفظ شده است.</p>
        <button type="button" className="button button--secondary button--small" disabled={checkingLatest} onClick={() => void checkLatest()}>دریافت نسخهٔ تازه</button>
      </div>}
      <fieldset className="editor-fieldset" disabled={saving || checkingLatest} aria-busy={saving || checkingLatest} aria-label="ویرایش تغذیهٔ شاگرد"><div className="editor-fieldset__content nutrition-editor__content">
      <div className="filter-tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`filter-tab${viewMode === 'plan' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={viewMode === 'plan'}
          onClick={() => setViewMode('plan')}
        >
          <ListOrdered size={15} /> برنامهٔ هفتگی
        </button>
        <button
          type="button"
          className={`filter-tab${viewMode === 'diary' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={viewMode === 'diary'}
          onClick={() => setViewMode('diary')}
        >
          <BookOpen size={15} /> دفتر خوراک ثبت‌شده
        </button>
      </div>

      {viewMode === 'diary' ? (
        <section className="diary-coach-view page-stack" aria-label="دفتر خوراک شاگرد">
          <div className="card-topline" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="field-control" style={{ margin: 0, minWidth: 200 }}>
              <span>تاریخ روز <small>شمسی</small></span>
              <PersianDateInput value={diaryDate} onChange={setDiaryDate} label="تاریخ روز" />
            </div>
            <span className="today-pill">
              {formatDate(`${diaryDate}T00:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>

          {diaryLoading && <p className="account-muted" role="status">در حال بارگذاری دفتر خوراک…</p>}
          {diaryError && <div className="account-load-error" role="alert">
            <p>{diaryError}</p>
            <button type="button" className="button button--secondary button--small" onClick={() => setDiaryAttempt((value) => value + 1)}>تلاش دوباره برای دریافت دفتر خوراک</button>
          </div>}

          {!diaryLoading && diaryData && (
            <>
              {diaryDayTotal && (
                <section className="nutrition-day-summary" aria-label={`جمع روز ${diaryDate}`}>
                  <div className="nutrition-day-summary__head">
                    <h3>مجموع خوراک روز</h3>
                    <span className="account-muted">{faNumber(diaryData.meals.length)} وعده</span>
                  </div>
                  <TotalsStrip totals={diaryDayTotal} items={dayItems(diaryData.meals)} />
                  <TargetBars totals={diaryDayTotal} targets={plan.targets} />
                </section>
              )}

              {diaryData.meals.length === 0 ? (
                <p className="account-muted">شاگرد هنوز برای این تاریخ وعده‌ای در دفتر خود ثبت نکرده است.</p>
              ) : (
                <div className="nutrition-meals">
                  {diaryData.meals.map((meal, mealIndex) => (
                    <article key={mealIndex} className="nutrition-meal nutrition-meal--read">
                      <header className="nutrition-meal__head">
                        <strong>{meal.name}</strong>
                      </header>
                      <ul className="nutrition-items">
                        {meal.items.map((item, itemIndex) => {
                          const food = FOODS_BY_ID.get(item.foodId);
                          return (
                            <li key={`${item.foodId}-${itemIndex}`} className="nutrition-item">
                              <div className="nutrition-item__name">
                                <strong>{food?.name ?? 'ماده'}</strong>
                                <small>{faNumber(roundTotals(itemTotals(item)).kcal)} کالری</small>
                              </div>
                              <span className="nutrition-item__amount">{faNumber(item.grams)} گرم</span>
                            </li>
                          );
                        })}
                      </ul>
                      {meal.items.length > 0 && <TotalsStrip totals={mealTotals(meal)} items={meal.items} compact />}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="nutrition-editor" aria-label="هدف‌های روزانه">
            <h3>هدف‌های روزانه</h3>
            <p className="account-muted">هر هدف را که خالی بگذاری، در برنامه نشان داده نمی‌شود.</p>
            <div className="nutrition-targets">
              <TargetInput label="کالری" unit="کیلوکالری" value={plan.targets.kcal} max={10000} onChange={(v) => setTarget('kcal', v)} />
              <TargetInput label="پروتئین" unit="گرم" value={plan.targets.proteinG} max={1000} onChange={(v) => setTarget('proteinG', v)} />
              <TargetInput label="کربوهیدرات" unit="گرم" value={plan.targets.carbsG} max={1000} onChange={(v) => setTarget('carbsG', v)} />
              <TargetInput label="چربی" unit="گرم" value={plan.targets.fatG} max={1000} onChange={(v) => setTarget('fatG', v)} />
            </div>
          </section>

          <nav className="nutrition-days" aria-label="روزهای هفته">
            {plan.days.map((d, index) => {
              const total = roundTotals(dayTotals(d));
              return (
                <button
                  key={d.name}
                  type="button"
                  className={`nutrition-day${index === dayIndex ? ' is-active' : ''}`}
                  aria-pressed={index === dayIndex}
                  onClick={() => setDayIndex(index)}
                >
                  <strong>{d.name}</strong>
                  <small>{d.meals.length === 0 ? 'خالی' : `${faNumber(total.kcal)} کالری`}</small>
                </button>
              );
            })}
          </nav>

          <section className="nutrition-day-summary" aria-label={`جمع ${day.name}`}>
            <div className="nutrition-day-summary__head">
              <h3>{day.name}</h3>
              <span className="account-muted">{faNumber(day.meals.length)} وعده</span>
            </div>
            <TotalsStrip totals={dayTotal} items={dayItems(day.meals)} />
            <TargetBars totals={dayTotal} targets={plan.targets} />
          </section>

          {/* Keyed by day, so the open search and the new-meal form start fresh on each day. */}
          <MealsEditor key={dayIndex} meals={day.meals} onChange={(meals) => updateDay(dayIndex, (d) => ({ ...d, meals }))} />

          <div className="nutrition-save-bar">
            <span className="account-muted" role="status">
              {saving || checkingLatest ? 'در حال بررسی و ذخیره…' : saved ? 'برنامه ذخیره شد.' : dirty ? 'تغییرات ذخیره‌نشده دارید.' : ' '}
            </span>
            <button type="button" className="button button--primary" disabled={saving || checkingLatest || !dirty || needsLatest} onClick={() => void save()}>
              <Save size={16} /> ذخیرهٔ برنامهٔ هفته
            </button>
          </div>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
        </>
      )}
      </div></fieldset>
    </PanelPage>
  );
}

function findProblem(plan: NutritionPlan): string | null {
  for (const day of plan.days) {
    for (const meal of day.meals) {
      if (!meal.name.trim()) return `وعدهٔ ${day.name} نام ندارد.`;
      for (const item of meal.items) {
        if (!Number.isFinite(item.grams) || item.grams <= 0 || item.grams > MAX_GRAMS) return `مقدار «${FOODS_BY_ID.get(item.foodId)?.name ?? 'ماده'}» باید بین ۰٫۱ تا ${MAX_GRAMS} گرم باشد.`;
      }
    }
  }
  return null;
}

function TargetInput({ label, unit, value, max, onChange }: { label: string; unit: string; value: number | null; max: number; onChange: (raw: string) => void }) {
  return (
    <label className="field-control">
      <span>{label} <small>{unit}</small></span>
      <input type="number" inputMode="decimal" min={0} max={max} step="any" value={value ?? ''} placeholder="بدون هدف" onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
