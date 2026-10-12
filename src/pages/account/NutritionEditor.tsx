import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
import { ApiError, api, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
import {
  FOODS_BY_ID,
  GROUP_LABELS,
  MAX_GRAMS,
  MAX_ITEMS,
  MAX_MEALS,
  MAX_MEAL_NAME,
  dayTotals,
  itemTotals,
  mealTotals,
  roundTotals,
  searchFoods,
  todayDayIndex,
  type NutritionPlan,
  type PlanDay,
  type PlanMeal,
  type Targets,
} from '../../lib/nutrition';
import { RequireRole, PanelPage } from './AccountShell';
import { TargetBars, TotalsStrip } from './NutritionParts';

/** The coach's editor for one student's weekly nutrition plan. Saved as a whole, after each change is checked by the server. */
export function NutritionEditor() {
  return (
    <RequireRole roles={['coach']}>
      <NutritionEditorScreen />
    </RequireRole>
  );
}

function NutritionEditorScreen() {
  const { studentId } = useParams();
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(todayDayIndex());
  const [openSearch, setOpenSearch] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [newMealName, setNewMealName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [planResult, studentsResult] = await Promise.all([
          api<{ plan: NutritionPlan }>('GET', `/students/${studentId}/nutrition`),
          api<{ students: (PublicUser & { password: string | null })[] }>('GET', '/students'),
        ]);
        if (cancelled) return;
        setPlan(planResult.plan);
        setStudentName(studentsResult.students.find((s) => String(s.id) === studentId)?.displayName ?? null);
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'برنامهٔ غذایی بارگذاری نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

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

  function addMeal() {
    if (!plan) return;
    const day = plan.days[dayIndex];
    if (!day) return;
    const name = (newMealName.trim() || `وعدهٔ ${faNumber(day.meals.length + 1)}`).slice(0, MAX_MEAL_NAME);
    if (day.meals.length >= MAX_MEALS) return;
    updateDay(dayIndex, (d) => ({ ...d, meals: [...d.meals, { name, items: [] }] }));
    // Step 2 starts at once: the new meal's content search is open.
    setOpenSearch(day.meals.length);
    setQuery('');
    setNewMealName('');
  }

  function renameMeal(mealIndex: number, name: string) {
    updateDay(dayIndex, (d) => ({ ...d, meals: d.meals.map((m, i) => (i === mealIndex ? { ...m, name } : m)) }));
  }

  function removeMeal(mealIndex: number) {
    const meal = plan?.days[dayIndex]?.meals[mealIndex];
    if (!meal || !window.confirm(`وعدهٔ «${meal.name}» و همهٔ موادش حذف شود؟`)) return;
    updateDay(dayIndex, (d) => ({ ...d, meals: d.meals.filter((_, i) => i !== mealIndex) }));
    setOpenSearch(null);
  }

  function addItem(mealIndex: number, foodId: string) {
    updateDay(dayIndex, (d) => ({
      ...d,
      meals: d.meals.map((m, i) => (i === mealIndex && m.items.length < MAX_ITEMS ? { ...m, items: [...m.items, { foodId, grams: 100 }] } : m)),
    }));
    setQuery('');
  }

  function setGrams(mealIndex: number, itemIndex: number, raw: string) {
    const grams = Number(raw);
    updateDay(dayIndex, (d) => ({
      ...d,
      meals: d.meals.map((m, i) =>
        i === mealIndex ? { ...m, items: m.items.map((item, j) => (j === itemIndex ? { ...item, grams: Number.isFinite(grams) ? grams : item.grams } : item)) } : m,
      ),
    }));
  }

  function removeItem(mealIndex: number, itemIndex: number) {
    const food = plan?.days[dayIndex]?.meals[mealIndex]?.items[itemIndex];
    if (!food || !window.confirm(`«${FOODS_BY_ID.get(food.foodId)?.name ?? 'این ماده'}» از این وعده حذف شود؟`)) return;
    updateDay(dayIndex, (d) => ({
      ...d,
      meals: d.meals.map((m, i) => (i === mealIndex ? { ...m, items: m.items.filter((_, j) => j !== itemIndex) } : m)),
    }));
  }

  async function save() {
    if (!plan) return;
    const problem = findProblem(plan);
    if (problem) {
      setSaveError(problem);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body = { targets: plan.targets, days: plan.days.map(({ meals }) => ({ meals })) };
      const result = await api<{ plan: NutritionPlan }>('PUT', `/students/${studentId}/nutrition`, body);
      setPlan(result.plan);
      setDirty(false);
      setSaved(true);
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'برنامه ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <PanelPage title="برنامهٔ غذایی">
        <p className="form-error" role="alert">{loadError}</p>
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

  const day = plan.days[dayIndex] as PlanDay;
  const dayTotal = dayTotals(day);
  const dayItems = day.meals.flatMap((meal) => meal.items);

  return (
    <PanelPage title={studentName ? `برنامهٔ غذایی ${studentName}` : 'برنامهٔ غذایی شاگرد'}>
      <Link className="chat-back" to="/coach"><ArrowLeft size={16} /> همهٔ شاگردها</Link>

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
              onClick={() => {
                setDayIndex(index);
                setOpenSearch(null);
                setQuery('');
              }}
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
        <TotalsStrip totals={dayTotal} items={dayItems} />
        <TargetBars totals={dayTotal} targets={plan.targets} />
      </section>

      {day.meals.length === 0 && <p className="account-muted">برای {day.name} هنوز وعده‌ای نیست. پایین همین صفحه وعده بسازید.</p>}

      <div className="nutrition-meals">
        {day.meals.map((meal, mealIndex) => (
          <MealEditor
            key={mealIndex}
            meal={meal}
            searching={openSearch === mealIndex}
            query={query}
            onToggleSearch={() => {
              setOpenSearch(openSearch === mealIndex ? null : mealIndex);
              setQuery('');
            }}
            onQuery={setQuery}
            onRename={(name) => renameMeal(mealIndex, name)}
            onRemove={() => removeMeal(mealIndex)}
            onAddItem={(foodId) => addItem(mealIndex, foodId)}
            onGrams={(itemIndex, raw) => setGrams(mealIndex, itemIndex, raw)}
            onRemoveItem={(itemIndex) => removeItem(mealIndex, itemIndex)}
          />
        ))}
      </div>

      {day.meals.length < MAX_MEALS && (
        <section className="nutrition-add-meal-block" aria-label="افزودن وعده">
          <p className="nutrition-step"><span>مرحلهٔ ۱</span> نام وعدهٔ تازه را بنویسید؛ بعد محتوای آن را اضافه می‌کنید.</p>
          <form
            className="nutrition-add-meal"
            onSubmit={(event) => {
              event.preventDefault();
              addMeal();
            }}
          >
            <label className="field-control">
              <span>نام وعده</span>
              <input value={newMealName} onChange={(event) => setNewMealName(event.target.value)} maxLength={MAX_MEAL_NAME} placeholder="مثلاً صبحانه" />
            </label>
            <button type="submit" className="button button--ghost"><Plus size={16} /> افزودن وعده</button>
          </form>
        </section>
      )}

      <div className="nutrition-save-bar">
        <span className="account-muted" role="status">
          {saving ? 'در حال ذخیره…' : saved ? 'برنامه ذخیره شد.' : dirty ? 'تغییرات ذخیره‌نشده دارید.' : ' '}
        </span>
        <button type="button" className="button button--primary" disabled={saving || !dirty} onClick={() => void save()}>
          <Save size={16} /> ذخیرهٔ برنامهٔ هفته
        </button>
      </div>
      {saveError && <p className="form-error" role="alert">{saveError}</p>}
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

interface MealEditorProps {
  meal: PlanMeal;
  searching: boolean;
  query: string;
  onToggleSearch: () => void;
  onQuery: (query: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddItem: (foodId: string) => void;
  onGrams: (itemIndex: number, raw: string) => void;
  onRemoveItem: (itemIndex: number) => void;
}

function MealEditor({ meal, searching, query, onToggleSearch, onQuery, onRename, onRemove, onAddItem, onGrams, onRemoveItem }: MealEditorProps) {
  const results = searching ? searchFoods(query) : [];
  return (
    <article className="nutrition-meal">
      <header className="nutrition-meal__head">
        <input className="nutrition-meal__name" value={meal.name} maxLength={MAX_MEAL_NAME} onChange={(event) => onRename(event.target.value)} aria-label="نام وعده" />
        <button type="button" className="icon-button" onClick={onRemove} aria-label={`حذف وعدهٔ ${meal.name}`}><Trash2 size={15} /></button>
      </header>

      {meal.items.length === 0 ? (
        <p className="nutrition-step"><span>مرحلهٔ ۲</span> محتوای این وعده را اضافه کنید، مثلاً تخم‌مرغ یا نان. کالری، درشت‌مغذی‌ها و سایر مواد خودکار حساب می‌شوند.</p>
      ) : (
        <ul className="nutrition-items">
          {meal.items.map((item, itemIndex) => {
            const food = FOODS_BY_ID.get(item.foodId);
            const totals = roundTotals(itemTotals(item));
            return (
              <li key={`${item.foodId}-${itemIndex}`} className="nutrition-item">
                <div className="nutrition-item__name">
                  <strong>{food?.name ?? 'ماده‌ای که دیگر در فهرست نیست'}</strong>
                  <small>{food ? GROUP_LABELS[food.group] : ''} · {faNumber(totals.kcal)} کالری · پروتئین {faNumber(totals.protein)} · چربی {faNumber(totals.fat)} · کربوهیدرات {faNumber(totals.carbs)}{food && food.sugar !== null ? ` · قند ${faNumber(totals.sugar)}` : ''}</small>
                </div>
                <label className="nutrition-item__grams">
                  <input type="number" min={0.1} max={MAX_GRAMS} step="any" value={item.grams} onChange={(event) => onGrams(itemIndex, event.target.value)} aria-label={`گرم ${food?.name ?? 'ماده'}`} />
                  <span>گرم</span>
                </label>
                <button type="button" className="icon-button" onClick={() => onRemoveItem(itemIndex)} aria-label={`حذف ${food?.name ?? 'ماده'}`}><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {meal.items.length > 0 && <TotalsStrip totals={mealTotals(meal)} items={meal.items} compact />}

      {meal.items.length < MAX_ITEMS && (
        <button type="button" className="button button--ghost nutrition-meal__add" onClick={onToggleSearch} aria-expanded={searching}>
          <Plus size={16} />{' '}
          {searching ? 'بستن' : meal.items.length === 0 ? 'افزودن محتوای وعده' : 'افزودن ماده'}
        </button>
      )}

      {searching && (
        <div className="nutrition-search">
          <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="نام غذا را بنویسید (فارسی یا انگلیسی)…" aria-label="جستجوی غذا" autoFocus />
          {query.trim() && results.length === 0 && <p className="account-muted">غذایی پیدا نشد.</p>}
          <ul className="nutrition-results">
            {results.map((food) => (
              <li key={food.id}>
                <button type="button" onClick={() => onAddItem(food.id)}>
                  <span>{food.name}</span>
                  <small>{faNumber(food.kcal)} کالری در ۱۰۰ گرم</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
