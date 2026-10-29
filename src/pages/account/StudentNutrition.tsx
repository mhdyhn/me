import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';
import {
  FOODS_BY_ID,
  dayTotals,
  itemTotals,
  mealTotals,
  roundTotals,
  todayDayIndex,
  type NutritionPlan,
} from '../../lib/nutrition';
import { TargetBars, TotalsStrip } from './NutritionParts';

interface StudentPlanResponse {
  coachName: string | null;
  plan: NutritionPlan | null;
}

/** The coach's nutrition plan, read-only, shown to the student above their own tracking. */
export function StudentNutritionPlan() {
  const [data, setData] = useState<StudentPlanResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [dayIndex, setDayIndex] = useState(todayDayIndex());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    api<StudentPlanResponse>('GET', '/me/nutrition')
      .then((result) => { if (active) setData(result); })
      .catch((caught) => {
        if (active) setLoadError(caught instanceof ApiError ? caught.message : 'برنامهٔ غذایی بارگذاری نشد.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryCount]);

  return (
    <section className="panel-card student-nutrition" aria-label="برنامهٔ غذایی مربی">
      <div className="card-topline">
        <div>
          <span className="eyebrow">برنامهٔ مربی</span>
          <h2>برنامهٔ غذایی هفته</h2>
        </div>
        {data?.coachName && <span className="today-pill">{data.coachName}</span>}
      </div>

      {loading && <p className="account-muted" role="status">در حال بارگذاری…</p>}
      {loadError && (
        <div className="student-nutrition-load-error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="button button--secondary button--small" disabled={loading} onClick={() => setRetryCount((count) => count + 1)}>
            تلاش دوباره برای بارگذاری برنامه
          </button>
        </div>
      )}
      {data && !data.plan && <p className="muted">مربی هنوز برنامهٔ غذایی شما را تعریف نکرده است.</p>}

      {data?.plan && (
        <PlanView plan={data.plan} dayIndex={dayIndex} onDay={setDayIndex} />
      )}
    </section>
  );
}

type ArchivedNutritionPlan = { coachId: number; coachName: string; plan: NutritionPlan };
type NutritionArchivePage = { plans: ArchivedNutritionPlan[]; nextCursor: number | null };

/** Previous coach plans remain private to the student and never replace the current plan. */
export function CoachNutritionArchive() {
  const [plans, setPlans] = useState<ArchivedNutritionPlan[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<NutritionArchivePage>('GET', '/me/nutrition/archive')
      .then((page) => { if (active) { setPlans(Array.isArray(page.plans) ? page.plans : []); setCursor(page.nextCursor ?? null); } })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : 'بایگانی تغذیه بارگذاری نشد.'); });
    return () => { active = false; };
  }, []);
  async function more() {
    if (cursor === null || busy) return;
    setBusy(true); setError('');
    try {
      const page = await api<NutritionArchivePage>('GET', `/me/nutrition/archive?cursor=${cursor}`);
      setPlans((current) => [...current, ...page.plans]); setCursor(page.nextCursor);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'ادامهٔ بایگانی بارگذاری نشد.'); }
    finally { setBusy(false); }
  }
  if (!plans.length) return error ? <p className="account-muted" role="status">{error}</p> : null;
  return <details className="panel-card coach-history">
    <summary>برنامه‌های غذایی مربیان قبلی</summary>
    <p className="account-muted">این برنامه‌ها فقط برای مشاهدهٔ خودت هستند و با مربی جدید به اشتراک گذاشته نمی‌شوند.</p>
    {plans.map((item) => <ArchivedPlan key={item.coachId} item={item} />)}
    {error && <p className="form-error" role="status">{error}</p>}
    {cursor !== null && <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void more()}>{busy ? 'در حال بارگذاری…' : 'نمایش بیشتر'}</button>}
  </details>;
}

function ArchivedPlan({ item }: { item: ArchivedNutritionPlan }) {
  const [dayIndex, setDayIndex] = useState(todayDayIndex());
  return <details className="coach-history__item"><summary>مربی {item.coachName}</summary>
    <PlanView plan={item.plan} dayIndex={dayIndex} onDay={setDayIndex} />
  </details>;
}

function PlanView({ plan, dayIndex, onDay }: { plan: NutritionPlan; dayIndex: number; onDay: (index: number) => void }) {
  const day = plan.days[dayIndex];
  if (!day) return null;
  const total = dayTotals(day);
  const dayItems = day.meals.flatMap((meal) => meal.items);
  return (
    <>
      <nav className="nutrition-days" aria-label="روزهای هفته">
        {plan.days.map((d, index) => (
          <button key={d.name} type="button" className={`nutrition-day${index === dayIndex ? ' is-active' : ''}`} aria-pressed={index === dayIndex} onClick={() => onDay(index)}>
            <strong>{d.name}</strong>
            <small>{d.meals.length === 0 ? 'خالی' : `${faNumber(roundTotals(dayTotals(d)).kcal)} کالری`}</small>
          </button>
        ))}
      </nav>

      <section className="nutrition-day-summary" aria-label={`جمع ${day.name}`}>
        <div className="nutrition-day-summary__head">
          <h3>{day.name}</h3>
        </div>
        <TotalsStrip totals={total} items={dayItems} />
        <TargetBars totals={total} targets={plan.targets} />
      </section>

      {day.meals.length === 0 && <p className="account-muted">برای این روز وعده‌ای تعریف نشده است.</p>}
      <div className="nutrition-meals">
        {day.meals.map((meal, mealIndex) => (
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
    </>
  );
}
