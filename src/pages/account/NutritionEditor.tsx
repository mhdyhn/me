import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { ApiError, api, type PublicUser } from '../../lib/api';
import { faNumber } from '../../lib/format';
import {
  dayTotals,
  roundTotals,
  todayDayIndex,
  type NutritionPlan,
  type PlanDay,
  type Targets,
  FOODS_BY_ID,
  MAX_GRAMS,
} from '../../lib/nutrition';
import { RequireRole, PanelPage } from './AccountShell';
import { TargetBars, TotalsStrip } from './NutritionParts';
import { MealsEditor, dayItems } from './MealsEditor';

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
