import { useMemo, useState } from 'react';
import { Check, Info, Leaf, Save, Utensils } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { RouteLoading } from '../components/RouteLoading';
import { DraftConflictNotice } from '../components/DraftConflictNotice';
import { useGuardedDraft } from '../components/useGuardedDraft';
import { DraftChangedError } from '../lib/draftGuard';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { StudentNutritionPlan } from './account/StudentNutrition';
import { MealDiary } from './account/MealDiary';
import { faNumber, getLocalDateKey } from '../lib/format';
import type { Targets } from '../lib/nutrition';
import type { NutritionGoals, NutritionDay } from '../types';

const numeric = (value: string) => value.trim() ? Number(value) : undefined;
const goalsView = (goals: NutritionGoals) => ({ calories: goals.dailyCalories?.toString() ?? '', protein: String(goals.proteinG), carbs: goals.carbsG?.toString() ?? '', fats: goals.fatsG?.toString() ?? '' });
const goalsValue = (view: ReturnType<typeof goalsView>): NutritionGoals => ({ dailyCalories: numeric(view.calories), proteinG: numeric(view.protein) ?? 0, carbsG: numeric(view.carbs), fatsG: numeric(view.fats) });

export function Nutrition() {
  const { user } = useSession();
  const { nutritionGoals, nutritionDays, profile, bodyweights, saveNutritionGoals, saveNutritionDay, loading } = useGym();
  const today = getLocalDateKey();
  const todayEntry = nutritionDays.find((day) => day.date === today);
  const currentWeight = bodyweights[0]?.weightKg ?? profile.weightKg;
  const hasWeight = Number.isFinite(currentWeight) && currentWeight >= 30;
  const proteinLow = Math.round(currentWeight * 1.6);
  const proteinHigh = Math.round(currentWeight * 2.2);
  const goalDraft = useGuardedDraft(goalsView(nutritionGoals));
  const noteDraft = useGuardedDraft<{ entry: NutritionDay | null; note: string }>({ entry: todayEntry ?? null, note: todayEntry?.notes ?? '' });
  const { calories: targetCalories, protein: targetProtein, carbs: targetCarbs, fats: targetFats } = goalDraft.draft;
  const foodNotes = noteDraft.draft.note;
  const [goalSaved, setGoalSaved] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState('');

  // The personal goals are the targets the meal diary is compared with.
  const diaryTargets = useMemo<Targets>(
    () => ({
      kcal: nutritionGoals.dailyCalories ?? null,
      proteinG: nutritionGoals.proteinG || null,
      carbsG: nutritionGoals.carbsG ?? null,
      fatG: nutritionGoals.fatsG ?? null,
    }),
    [nutritionGoals],
  );

  const submitGoals = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (goalDraft.conflict) { setGoalError('ابتدا نسخهٔ تازه و پیش‌نویس را بررسی کن.'); return; }
    const calories = numeric(targetCalories);
    const protein = numeric(targetProtein);
    const carbs = numeric(targetCarbs);
    const fats = numeric(targetFats);
    if (calories !== undefined && (!Number.isFinite(calories) || calories < 500 || calories > 10000)) { setGoalError('برآورد کالری باید بین ۵۰۰ تا ۱۰٬۰۰۰ باشد یا این بخش را خالی بگذار.'); return; }
    if (protein === undefined || !Number.isFinite(protein) || protein < 0 || protein > 500) { setGoalError('هدف پروتئین را به‌صورت عددی معتبر و بر حسب گرم وارد کن.'); return; }
    if (carbs !== undefined && (!Number.isFinite(carbs) || carbs < 0 || carbs > 1000)) { setGoalError('هدف کربوهیدرات را معتبر وارد کن یا خالی بگذار.'); return; }
    if (fats !== undefined && (!Number.isFinite(fats) || fats < 0 || fats > 500)) { setGoalError('هدف چربی را معتبر وارد کن یا خالی بگذار.'); return; }
    try {
      const next = { dailyCalories: calories, proteinG: protein, carbsG: carbs, fatsG: fats };
      const stored = await saveNutritionGoals(next, goalsValue(goalDraft.base));
      if (stored === false) { setGoalSaved(false); setGoalError('ذخیره روی دستگاه انجام نشد؛ تغییر فقط در این زبانه باقی می‌ماند.'); return; }
      goalDraft.setDraft(goalsView(next));
      setGoalError(''); setGoalSaved(true); window.setTimeout(() => setGoalSaved(false), 1800);
    } catch (error) { setGoalError(error instanceof DraftChangedError ? error.message : 'ذخیرهٔ هدف‌ها انجام نشد.'); }
  };

  const submitNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (noteDraft.conflict) { setNoteError('ابتدا نسخهٔ تازه و پیش‌نویس را بررسی کن.'); return; }
    if (foodNotes.length > 1000) { setNoteError('یادداشت باید کمتر از ۱۰۰۰ نویسه باشد.'); return; }
    // Keep the day's other values and verify the whole entry in the storage transaction.
    const next = { ...(noteDraft.base.entry ?? {}), id: today, date: today, notes: foodNotes.trim() };
    try {
      const stored = await saveNutritionDay(next, noteDraft.base.entry);
      if (stored === false) { setNoteSaved(false); setNoteError('ذخیره روی دستگاه انجام نشد؛ تغییر فقط در این زبانه باقی می‌ماند.'); return; }
      noteDraft.setDraft({ entry: next, note: next.notes });
      setNoteError(''); setNoteSaved(true); window.setTimeout(() => setNoteSaved(false), 1800);
    } catch (error) { setNoteError(error instanceof DraftChangedError ? error.message : 'ذخیرهٔ یادداشت انجام نشد.'); }
  };

  const currentWeightText = faNumber(currentWeight, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  if (loading) return <RouteLoading />;

  return (
    <div className="page-stack nutrition-page">
      {user?.role === 'student' && user.coachId !== null && <StudentNutritionPlan />}
      <SectionHeading eyebrow="سوخت تمرین" title="تغذیه را کاربردی نگه دار." description="وعده‌های روزانه‌ات را ثبت کن؛ کالری و درشت‌مغذی‌ها خودکار حساب می‌شوند و با هدف‌هایت مقایسه می‌شوند." />
      <div className="nutrition-context panel-card">
        <span className="nutrition-context__icon"><Leaf size={19} /></span>
        <div><span className="eyebrow">نقطهٔ شروع · نه نسخهٔ قطعی</span>{hasWeight ? <p>با وزن <strong>{currentWeightText} کیلوگرم</strong>، بازهٔ عمومی پروتئین حدود <strong>{faNumber(proteinLow)} تا {faNumber(proteinHigh)} گرم در روز</strong> (تقریباً ۱٫۶ تا ۲٫۲ گرم به‌ازای هر کیلوگرم) است. هدف قابل تنظیم است؛ این برنامه نیاز دقیق کالری تو را نمی‌داند.</p> : <p>برای دیدن بازهٔ تقریبی پروتئین، ابتدا وزن خود را در پروفایل یا بخش پیشرفت ثبت کن.</p>}</div>
        {hasWeight && <span className="nutrition-context__weight">{currentWeightText}<small>کیلوگرم</small></span>}
      </div>

      <div className="nutrition-grid">
        <section className="panel-card nutrition-goals-card">
          <div className="card-topline"><div><span className="eyebrow">هدف‌های روزانه</span><h2>یک برآورد تعیین کن.</h2></div><Utensils size={18} className="icon-accent" /></div>
          <p className="muted">نیاز به کالری برای هر فرد متفاوت است. خودت یک برآورد آغازین وارد کن و پس از چند هفته روندت را بررسی کن.</p>
          <form className="form-stack" onSubmit={(event) => void submitGoals(event)}>
            <label className="field-control"><span>هدف کالری <small>اختیاری · کیلوکالری</small></span><input type="number" min="500" max="10000" step="25" inputMode="numeric" value={targetCalories} onChange={(event) => goalDraft.setDraft((current) => ({ ...current, calories: event.target.value }))} placeholder="برآورد دلخواهت را وارد کن" /></label>
            <label className="field-control"><span>پروتئین <small>گرم در روز</small></span><div className="input-with-unit"><input type="number" min="0" max="500" step="1" value={targetProtein} onChange={(event) => goalDraft.setDraft((current) => ({ ...current, protein: event.target.value }))} required /><span>گرم</span></div><small className="field-hint">{hasWeight ? `بازهٔ تقریبی برای وزن فعلی: ${faNumber(proteinLow)} تا ${faNumber(proteinHigh)} گرم.` : 'برای برآورد بازهٔ پروتئین، ابتدا وزن را ثبت کن.'}</small></label>
            <div className="macro-inputs"><label className="field-control"><span>کربوهیدرات <small>گرم</small></span><input type="number" min="0" max="1000" step="1" value={targetCarbs} onChange={(event) => goalDraft.setDraft((current) => ({ ...current, carbs: event.target.value }))} placeholder="اختیاری" /></label><label className="field-control"><span>چربی <small>گرم</small></span><input type="number" min="0" max="500" step="1" value={targetFats} onChange={(event) => goalDraft.setDraft((current) => ({ ...current, fats: event.target.value }))} placeholder="اختیاری" /></label></div>
            {goalDraft.conflict && <DraftConflictNotice latest={nutritionGoals} discard={goalDraft.discard} acceptCurrent={goalDraft.acceptCurrent} />}
            {goalError && <p className="form-error" role="alert">{goalError}</p>}
            <button className="button button--primary button--full" type="submit">{goalSaved ? <><Check size={16} /> هدف‌ها ذخیره شد</> : <><Save size={16} /> ذخیرهٔ هدف‌ها</>}</button>
          </form>
          <div className="nutrition-disclaimer"><Info size={15} /><span>این برآوردها فقط برای پیگیری هستند و توصیهٔ پزشکی محسوب نمی‌شوند. در صورت نیاز، بر اساس روند، اشتها و نظر متخصص تنظیمشان کن.</span></div>
        </section>

        <MealDiary targets={diaryTargets} />
      </div>

      <section className="panel-card nutrition-note-card">
        <div className="card-topline"><div><span className="eyebrow">یادداشت امروز</span><h2>خوراک و حال امروز.</h2></div><span className="today-pill">امروز</span></div>
        <form className="form-stack" onSubmit={(event) => void submitNote(event)}>
          <label className="field-control"><span>یادداشت خوراک <small>اختیاری</small></span><textarea rows={3} value={foodNotes} onChange={(event) => noteDraft.setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="اشتها، احساس بعد از غذا یا نکته‌ای برای یادآوری…" /></label>
          {noteDraft.conflict && <DraftConflictNotice latest={todayEntry ?? null} discard={noteDraft.discard} acceptCurrent={noteDraft.acceptCurrent} />}
          {noteError && <p className="form-error" role="alert">{noteError}</p>}
          <button className="button button--secondary button--full" type="submit">{noteSaved ? <><Check size={16} /> یادداشت امروز ذخیره شد</> : <><Save size={16} /> ذخیرهٔ ثبت امروز</>}</button>
        </form>
      </section>
    </div>
  );
}
