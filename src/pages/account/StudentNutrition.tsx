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
  const [dayIndex, setDayIndex] = useState(todayDayIndex());

  useEffect(() => {
    api<StudentPlanResponse>('GET', '/me/nutrition')
      .then(setData)
      .catch((caught) => setLoadError(caught instanceof ApiError ? caught.message : 'برنامهٔ غذایی بارگذاری نشد.'));
  }, []);

  return (
    <section className="panel-card student-nutrition" aria-label="برنامهٔ غذایی مربی">
      <div className="card-topline">
        <div>
          <span className="eyebrow">برنامهٔ مربی</span>
          <h2>برنامهٔ غذایی هفته</h2>
        </div>
        {data?.coachName && <span className="today-pill">{data.coachName}</span>}
      </div>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!loadError && data === null && <p className="account-muted">در حال بارگذاری…</p>}
      {data && !data.plan && <p className="muted">مربی هنوز برنامهٔ غذایی شما را تعریف نکرده است.</p>}

      {data?.plan && (
        <PlanView plan={data.plan} dayIndex={dayIndex} onDay={setDayIndex} />
      )}
    </section>
  );
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
