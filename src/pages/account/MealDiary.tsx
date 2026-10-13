import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { getLocalDateKey } from '../../lib/format';
import { dayTotals, type Diary, type PlanMeal, type Targets } from '../../lib/nutrition';
import { MealsEditor, dayItems } from './MealsEditor';
import { TargetBars, TotalsStrip } from './NutritionParts';

/**
 * Everyone's own meal log for one calendar day: the same two-step meals as the coach's plan,
 * saved to the signed-in user's diary. Totals are compared with the personal targets when set.
 */
export function MealDiary({ targets }: { targets: Targets }) {
  const today = getLocalDateKey();
  const [day, setDay] = useState(today);
  const [meals, setMeals] = useState<PlanMeal[] | null>(null);
  const [snapshot, setSnapshot] = useState('[]');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMeals(null);
    setLoadError(null);
    (async () => {
      try {
        const result = await api<{ diary: Diary }>('GET', `/me/diary/${day}`);
        if (cancelled) return;
        setMeals(result.diary.meals);
        setSnapshot(JSON.stringify(result.diary.meals));
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'دفترچهٔ غذایی بارگذاری نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day]);

  const dirty = meals !== null && JSON.stringify(meals) !== snapshot;
  const total = useMemo(() => (meals ? dayTotals({ name: day, meals }) : null), [meals, day]);

  function changeDay(next: string) {
    if (!next || next === day) return;
    if (dirty && !window.confirm('تغییرات این روز ذخیره نشده‌اند. بدون ذخیره به روز دیگر بروید؟')) return;
    setSaved(false);
    setSaveError(null);
    setDay(next);
  }

  async function save() {
    if (!meals) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api<{ diary: Diary }>('PUT', '/me/diary', { day, meals });
      setMeals(result.diary.meals);
      setSnapshot(JSON.stringify(result.diary.meals));
      setSaved(true);
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel-card meal-diary" aria-label="ثبت وعده‌های روزانه">
      <div className="card-topline">
        <div>
          <span className="eyebrow">ثبت وعده‌های روزانه</span>
          <h2>آنچه خوردی.</h2>
        </div>
        <div className="meal-diary__day">
          <input type="date" value={day} max={today} onChange={(event) => changeDay(event.target.value)} aria-label="روز" />
          {day !== today && (
            <button type="button" className="button button--ghost" onClick={() => changeDay(today)}>
              <RotateCcw size={14} /> امروز
            </button>
          )}
        </div>
      </div>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!meals && !loadError && <p className="account-muted">در حال بارگذاری…</p>}

      {meals && total && (
        <>
          <TotalsStrip totals={total} items={dayItems(meals)} />
          <TargetBars totals={total} targets={targets} />
          <MealsEditor key={day} meals={meals} onChange={(next) => { setMeals(next); setSaved(false); }} />

          <div className="nutrition-save-bar">
            <span className="account-muted" role="status">
              {saving ? 'در حال ذخیره…' : saved ? 'ثبت این روز ذخیره شد.' : dirty ? 'تغییرات ذخیره‌نشده دارید.' : ' '}
            </span>
            <button type="button" className="button button--primary" disabled={saving || !dirty} onClick={() => void save()}>
              <Save size={16} /> ذخیرهٔ این روز
            </button>
          </div>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
        </>
      )}
    </section>
  );
}
