import { faNumber } from '../lib/format';
import { FOODS_BY_ID, type NutritionPlan, type PlanMeal } from '../lib/nutrition';

export function MealsConflictPreview({ meals }: { meals: PlanMeal[] }) {
  if (!meals.length) return <p className="account-muted">در نسخهٔ تازه وعده‌ای ثبت نشده است.</p>;
  return <ul className="conflict-preview-list">{meals.map((meal, index) => <li key={index}>
    <strong>{meal.name}</strong>
    {meal.items.length > 0 && <ul>{meal.items.map((item, itemIndex) => <li key={itemIndex}>{FOODS_BY_ID.get(item.foodId)?.name ?? item.foodId} · {faNumber(item.grams)} گرم</li>)}</ul>}
  </li>)}</ul>;
}

export function PlanConflictPreview({ plan }: { plan: NutritionPlan }) {
  const targets = [
    ['کالری', plan.targets.kcal, 'کیلوکالری'], ['پروتئین', plan.targets.proteinG, 'گرم'],
    ['کربوهیدرات', plan.targets.carbsG, 'گرم'], ['چربی', plan.targets.fatG, 'گرم'],
  ] as const;
  return <div className="conflict-preview-plan">
    <p>{targets.filter(([, value]) => value !== null).map(([label, value, unit]) => `${label}: ${faNumber(value!)} ${unit}`).join(' · ') || 'هدف روزانه‌ای ثبت نشده است.'}</p>
    {plan.days.map((day, index) => <div key={index}><strong>{day.name}</strong><MealsConflictPreview meals={day.meals} /></div>)}
  </div>;
}
