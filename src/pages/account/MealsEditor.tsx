import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { faNumber } from '../../lib/format';
import {
  FOODS_BY_ID,
  GROUP_LABELS,
  MAX_GRAMS,
  MAX_ITEMS,
  MAX_MEALS,
  MAX_MEAL_NAME,
  countToGrams,
  gramsToCount,
  itemTotals,
  mealTotals,
  roundNutrient,
  searchFoods,
  type PlanMeal,
  type PlanItem,
} from '../../lib/nutrition';
import { TotalsStrip } from './NutritionParts';

type Unit = 'piece' | 'grams';

/**
 * Meals of one day, built in two steps: first name the meal, then add what is in it.
 * Used by the coach's plan and by everyone's personal diary. Foods that come in pieces
 * (an egg, a slice of bread) are entered as a count; everything else in grams.
 */
export function MealsEditor({ meals, onChange }: { meals: PlanMeal[]; onChange: (meals: PlanMeal[]) => void }) {
  const [openSearch, setOpenSearch] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [newMealName, setNewMealName] = useState('');
  const [units, setUnits] = useState<Record<string, Unit>>({});

  function addMeal() {
    if (meals.length >= MAX_MEALS) return;
    const name = (newMealName.trim() || `وعدهٔ ${faNumber(meals.length + 1)}`).slice(0, MAX_MEAL_NAME);
    onChange([...meals, { name, items: [] }]);
    // Step 2 starts at once: the new meal's content search is open.
    setOpenSearch(meals.length);
    setQuery('');
    setNewMealName('');
  }

  function renameMeal(mealIndex: number, name: string) {
    onChange(meals.map((meal, i) => (i === mealIndex ? { ...meal, name } : meal)));
  }

  async function removeMeal(mealIndex: number) {
    const meal = meals[mealIndex];
    if (!meal) return;
    const ok = await confirmModal({
      title: 'حذف وعده غذایی',
      message: `وعدهٔ «${meal.name}» و همهٔ موادش حذف شود؟`,
      confirmText: 'حذف وعده',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    onChange(meals.filter((_, i) => i !== mealIndex));
    setOpenSearch(null);
  }

  function addItem(mealIndex: number, foodId: string) {
    const food = FOODS_BY_ID.get(foodId);
    // One piece for foods counted by piece, 100 g otherwise.
    const grams = food?.piece ? food.piece.grams : 100;
    if (food?.piece) setUnits((prev) => ({ ...prev, [foodId]: 'piece' }));
    onChange(
      meals.map((meal, i) =>
        i === mealIndex && meal.items.length < MAX_ITEMS ? { ...meal, items: [...meal.items, { foodId, grams }] } : meal,
      ),
    );
    setQuery('');
  }

  function setGrams(mealIndex: number, itemIndex: number, grams: number) {
    onChange(
      meals.map((meal, i) =>
        i === mealIndex
          ? { ...meal, items: meal.items.map((item, j) => (j === itemIndex ? { ...item, grams: Number.isFinite(grams) ? grams : item.grams } : item)) }
          : meal,
      ),
    );
  }

  async function removeItem(mealIndex: number, itemIndex: number) {
    const food = meals[mealIndex]?.items[itemIndex];
    if (!food) return;
    const foodName = FOODS_BY_ID.get(food.foodId)?.name ?? 'این ماده';
    const ok = await confirmModal({
      title: 'حذف ماده غذایی',
      message: `«${foodName}» از این وعده حذف شود؟`,
      confirmText: 'حذف ماده',
      cancelText: 'انصراف',
      variant: 'danger',
    });
    if (!ok) return;
    onChange(meals.map((meal, i) => (i === mealIndex ? { ...meal, items: meal.items.filter((_, j) => j !== itemIndex) } : meal)));
  }

  return (
    <>
      <div className="nutrition-meals">
        {meals.length === 0 && <p className="account-muted">هنوز وعده‌ای نیست. پایین همین بخش یک وعده بسازید.</p>}
        {meals.map((meal, mealIndex) => (
          <MealCard
            key={mealIndex}
            meal={meal}
            searching={openSearch === mealIndex}
            query={query}
            units={units}
            onUnit={(foodId, unit) => setUnits((prev) => ({ ...prev, [foodId]: unit }))}
            onToggleSearch={() => {
              setOpenSearch(openSearch === mealIndex ? null : mealIndex);
              setQuery('');
            }}
            onQuery={setQuery}
            onRename={(name) => renameMeal(mealIndex, name)}
            onRemove={() => removeMeal(mealIndex)}
            onAddItem={(foodId) => addItem(mealIndex, foodId)}
            onGrams={(itemIndex, grams) => setGrams(mealIndex, itemIndex, grams)}
            onRemoveItem={(itemIndex) => removeItem(mealIndex, itemIndex)}
          />
        ))}
      </div>

      {meals.length < MAX_MEALS && (
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
    </>
  );
}

/** Totals of a whole day, from every item of every meal. */
export function dayItems(meals: PlanMeal[]): PlanItem[] {
  return meals.flatMap((meal) => meal.items);
}

interface MealCardProps {
  meal: PlanMeal;
  searching: boolean;
  query: string;
  units: Record<string, Unit>;
  onUnit: (foodId: string, unit: Unit) => void;
  onToggleSearch: () => void;
  onQuery: (query: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddItem: (foodId: string) => void;
  onGrams: (itemIndex: number, grams: number) => void;
  onRemoveItem: (itemIndex: number) => void;
}

function MealCard({ meal, searching, query, units, onUnit, onToggleSearch, onQuery, onRename, onRemove, onAddItem, onGrams, onRemoveItem }: MealCardProps) {
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
            const totals = itemTotals(item);
            const piece = food?.piece ?? null;
            const unit: Unit = piece && units[item.foodId] !== 'grams' ? 'piece' : 'grams';
            const name = food?.name ?? 'ماده‌ای که دیگر در فهرست نیست';
            return (
              <li key={`${item.foodId}-${itemIndex}`} className="nutrition-item">
                <div className="nutrition-item__name">
                  <strong>{name}</strong>
                  <small>
                    {food ? GROUP_LABELS[food.group] : ''} · {faNumber(roundNutrient('kcal', totals.kcal))} کالری · پروتئین {faNumber(roundNutrient('protein', totals.protein))} · چربی {faNumber(roundNutrient('fat', totals.fat))} · کربوهیدرات {faNumber(roundNutrient('carbs', totals.carbs))}
                    {food && food.sugar !== null ? ` · قند ${faNumber(roundNutrient('sugar', totals.sugar))}` : ''}
                  </small>
                </div>
                {piece && unit === 'piece' ? (
                  <label className="nutrition-item__grams">
                    <input
                      type="number"
                      min={0.25}
                      max={MAX_GRAMS}
                      step="0.5"
                      value={gramsToCount(item.grams, piece)}
                      onChange={(event) => onGrams(itemIndex, countToGrams(Number(event.target.value), piece))}
                      aria-label={`تعداد ${name}`}
                    />
                    <span>{piece.label}</span>
                  </label>
                ) : (
                  <label className="nutrition-item__grams">
                    <input type="number" min={0.1} max={MAX_GRAMS} step="any" value={item.grams} onChange={(event) => onGrams(itemIndex, Number(event.target.value))} aria-label={`گرم ${name}`} />
                    <span>گرم</span>
                  </label>
                )}
                {piece && (
                  <button type="button" className="nutrition-unit-toggle" onClick={() => onUnit(item.foodId, unit === 'piece' ? 'grams' : 'piece')}>
                    {unit === 'piece' ? 'گرم' : piece.label}
                  </button>
                )}
                <button type="button" className="icon-button" onClick={() => onRemoveItem(itemIndex)} aria-label={`حذف ${name}`}><Trash2 size={15} /></button>
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
                  <small>
                    {food.piece ? `هر ${food.piece.label} ≈ ${faNumber(food.piece.grams)} گرم` : `${faNumber(food.kcal)} کالری در ۱۰۰ گرم`}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
