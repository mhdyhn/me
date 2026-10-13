import { useEffect, useMemo, useState } from 'react';
import { Check, Info, Leaf, Save, Utensils } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { StudentNutritionPlan } from './account/StudentNutrition';
import { MealDiary } from './account/MealDiary';
import { faNumber, getLocalDateKey } from '../lib/format';
import type { Targets } from '../lib/nutrition';

const numeric = (value: string) => value.trim() ? Number(value) : undefined;

export function Nutrition() {
  const { user } = useSession();
  const { nutritionGoals, nutritionDays, profile, bodyweights, saveNutritionGoals, saveNutritionDay } = useGym();
  const today = getLocalDateKey();
  const todayEntry = nutritionDays.find((day) => day.date === today);
  const currentWeight = bodyweights[0]?.weightKg ?? profile.weightKg;
  const proteinLow = Math.round(currentWeight * 1.6);
  const proteinHigh = Math.round(currentWeight * 2.2);
  const [targetCalories, setTargetCalories] = useState(nutritionGoals.dailyCalories?.toString() ?? '');
  const [targetProtein, setTargetProtein] = useState(String(nutritionGoals.proteinG));
  const [targetCarbs, setTargetCarbs] = useState(nutritionGoals.carbsG?.toString() ?? '');
  const [targetFats, setTargetFats] = useState(nutritionGoals.fatsG?.toString() ?? '');
  const [goalSaved, setGoalSaved] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [foodNotes, setFoodNotes] = useState(todayEntry?.notes ?? '');
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    setFoodNotes(todayEntry?.notes ?? '');
  }, [todayEntry?.id]);

  useEffect(() => {
    setTargetCalories(nutritionGoals.dailyCalories?.toString() ?? '');
    setTargetProtein(String(nutritionGoals.proteinG));
    setTargetCarbs(nutritionGoals.carbsG?.toString() ?? '');
    setTargetFats(nutritionGoals.fatsG?.toString() ?? '');
  }, [nutritionGoals]);

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
    const calories = numeric(targetCalories);
    const protein = numeric(targetProtein);
    const carbs = numeric(targetCarbs);
    const fats = numeric(targetFats);
    if (calories !== undefined && (!Number.isFinite(calories) || calories < 500 || calories > 10000)) { setGoalError('برآورد کالری باید بین ۵۰۰ تا ۱۰٬۰۰۰ باشد یا این بخش را خالی بگذار.'); return; }
    if (protein === undefined || !Number.isFinite(protein) || protein < 0 || protein > 500) { setGoalError('هدف پروتئین را به‌صورت عددی معتبر و بر حسب گرم وارد کن.'); return; }
    if (carbs !== undefined && (!Number.isFinite(carbs) || carbs < 0 || carbs > 1000)) { setGoalError('هدف کربوهیدرات را معتبر وارد کن یا خالی بگذار.'); return; }
    if (fats !== undefined && (!Number.isFinite(fats) || fats < 0 || fats > 500)) { setGoalError('هدف چربی را معتبر وارد کن یا خالی بگذار.'); return; }
    await saveNutritionGoals({ dailyCalories: calories, proteinG: protein, carbsG: carbs, fatsG: fats });
    setGoalError(''); setGoalSaved(true); window.setTimeout(() => setGoalSaved(false), 1800);
  };

  const submitNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (foodNotes.length > 1000) { setNoteError('یادداشت باید کمتر از ۱۰۰۰ نویسه باشد.'); return; }
    // Keep the day's other values; only the note changes.
    await saveNutritionDay({ ...(todayEntry ?? {}), date: today, notes: foodNotes.trim() });
    setNoteError(''); setNoteSaved(true); window.setTimeout(() => setNoteSaved(false), 1800);
  };

  const currentWeightText = faNumber(currentWeight, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="page-stack nutrition-page">
      {user?.role === 'student' && <StudentNutritionPlan />}
      <SectionHeading eyebrow="سوخت تمرین" title="تغذیه را کاربردی نگه دار." description="وعده‌های روزانه‌ات را ثبت کن؛ کالری و درشت‌مغذی‌ها خودکار حساب می‌شوند و با هدف‌هایت مقایسه می‌شوند." />
      <div className="nutrition-context panel-card">
        <span className="nutrition-context__icon"><Leaf size={19} /></span>
        <div><span className="eyebrow">نقطهٔ شروع · نه نسخهٔ قطعی</span><p>با وزن <strong>{currentWeightText} کیلوگرم</strong>، بازهٔ عمومی پروتئین حدود <strong>{faNumber(proteinLow)} تا {faNumber(proteinHigh)} گرم در روز</strong> (تقریباً ۱٫۶ تا ۲٫۲ گرم به‌ازای هر کیلوگرم) است. هدف قابل تنظیم است؛ این برنامه نیاز دقیق کالری تو را نمی‌داند.</p></div>
        <span className="nutrition-context__weight">{currentWeightText}<small>کیلوگرم</small></span>
      </div>

      <div className="nutrition-grid">
        <section className="panel-card nutrition-goals-card">
          <div className="card-topline"><div><span className="eyebrow">هدف‌های روزانه</span><h2>یک برآورد تعیین کن.</h2></div><Utensils size={18} className="icon-accent" /></div>
          <p className="muted">نیاز به کالری برای هر فرد متفاوت است. خودت یک برآورد آغازین وارد کن و پس از چند هفته روندت را بررسی کن.</p>
          <form className="form-stack" onSubmit={(event) => void submitGoals(event)}>
            <label className="field-control"><span>هدف کالری <small>اختیاری · کیلوکالری</small></span><input type="number" min="500" max="10000" step="25" inputMode="numeric" value={targetCalories} onChange={(event) => setTargetCalories(event.target.value)} placeholder="برآورد دلخواهت را وارد کن" /></label>
            <label className="field-control"><span>پروتئین <small>گرم در روز</small></span><div className="input-with-unit"><input type="number" min="0" max="500" step="1" value={targetProtein} onChange={(event) => setTargetProtein(event.target.value)} required /><span>گرم</span></div><small className="field-hint">بازهٔ تقریبی برای وزن فعلی: {faNumber(proteinLow)} تا {faNumber(proteinHigh)} گرم.</small></label>
            <div className="macro-inputs"><label className="field-control"><span>کربوهیدرات <small>گرم</small></span><input type="number" min="0" max="1000" step="1" value={targetCarbs} onChange={(event) => setTargetCarbs(event.target.value)} placeholder="اختیاری" /></label><label className="field-control"><span>چربی <small>گرم</small></span><input type="number" min="0" max="500" step="1" value={targetFats} onChange={(event) => setTargetFats(event.target.value)} placeholder="اختیاری" /></label></div>
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
          <label className="field-control"><span>یادداشت خوراک <small>اختیاری</small></span><textarea rows={3} value={foodNotes} onChange={(event) => setFoodNotes(event.target.value)} placeholder="اشتها، احساس بعد از غذا یا نکته‌ای برای یادآوری…" /></label>
          {noteError && <p className="form-error" role="alert">{noteError}</p>}
          <button className="button button--secondary button--full" type="submit">{noteSaved ? <><Check size={16} /> یادداشت امروز ذخیره شد</> : <><Save size={16} /> ذخیرهٔ ثبت امروز</>}</button>
        </form>
      </section>
    </div>
  );
}
