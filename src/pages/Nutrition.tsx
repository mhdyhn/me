import { useEffect, useMemo, useState } from 'react';
import { Check, Info, Leaf, Save, Utensils } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { faNumber, formatDate } from '../lib/format';
import { getLocalDateKey } from '../lib/format';

const numeric = (value: string) => value.trim() ? Number(value) : undefined;

export function Nutrition() {
  const { nutritionGoals, nutritionDays, profile, bodyweights, saveNutritionGoals, saveNutritionDay } = useGym();
  const currentWeight = bodyweights[0]?.weightKg ?? profile.weightKg;
  const proteinLow = Math.round(currentWeight * 1.6);
  const proteinHigh = Math.round(currentWeight * 2.2);
  const today = getLocalDateKey();
  const todayEntry = nutritionDays.find((day) => day.date === today);
  const [targetCalories, setTargetCalories] = useState(nutritionGoals.dailyCalories?.toString() ?? '');
  const [targetProtein, setTargetProtein] = useState(String(nutritionGoals.proteinG));
  const [targetCarbs, setTargetCarbs] = useState(nutritionGoals.carbsG?.toString() ?? '');
  const [targetFats, setTargetFats] = useState(nutritionGoals.fatsG?.toString() ?? '');
  const [intakeCalories, setIntakeCalories] = useState('');
  const [intakeProtein, setIntakeProtein] = useState('');
  const [intakeCarbs, setIntakeCarbs] = useState('');
  const [intakeFats, setIntakeFats] = useState('');
  const [foodNotes, setFoodNotes] = useState('');
  const [goalSaved, setGoalSaved] = useState(false);
  const [daySaved, setDaySaved] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [dayError, setDayError] = useState('');

  useEffect(() => {
    setTargetCalories(nutritionGoals.dailyCalories?.toString() ?? '');
    setTargetProtein(String(nutritionGoals.proteinG));
    setTargetCarbs(nutritionGoals.carbsG?.toString() ?? '');
    setTargetFats(nutritionGoals.fatsG?.toString() ?? '');
  }, [nutritionGoals]);

  useEffect(() => {
    setIntakeCalories(todayEntry?.calories?.toString() ?? '');
    setIntakeProtein(todayEntry?.proteinG?.toString() ?? '');
    setIntakeCarbs(todayEntry?.carbsG?.toString() ?? '');
    setIntakeFats(todayEntry?.fatsG?.toString() ?? '');
    setFoodNotes(todayEntry?.notes ?? '');
  }, [todayEntry?.id]);

  const lastSevenDays = useMemo(() => nutritionDays.slice(0, 7), [nutritionDays]);

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

  const submitDay = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const calories = numeric(intakeCalories);
    const protein = numeric(intakeProtein);
    const carbs = numeric(intakeCarbs);
    const fats = numeric(intakeFats);
    const allValues = [calories, protein, carbs, fats].filter((value) => value !== undefined);
    if (allValues.some((value) => !Number.isFinite(value) || value < 0)) { setDayError('مقادیر مصرف روزانه باید صفر یا بیشتر باشند.'); return; }
    await saveNutritionDay({ date: today, calories, proteinG: protein, carbsG: carbs, fatsG: fats, notes: foodNotes.trim() });
    setDayError(''); setDaySaved(true); window.setTimeout(() => setDaySaved(false), 1800);
  };

  const currentWeightText = faNumber(currentWeight, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="page-stack nutrition-page">
      <SectionHeading eyebrow="سوخت تمرین" title="تغذیه را کاربردی نگه دار." description="یک هدف آغازین معقول انتخاب کن، موارد مهم را ثبت کن و بر اساس روند واقعی وزن و تمرینت تنظیمش کن." />
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

        <section className="panel-card nutrition-log-card">
          <div className="card-topline"><div><span className="eyebrow">ثبت خوراک روزانه</span><h2>مصرف امروز.</h2></div><span className="today-pill">امروز</span></div>
          <form className="form-stack" onSubmit={(event) => void submitDay(event)}>
            <div className="macro-inputs macro-inputs--four"><label className="field-control"><span>کالری</span><input type="number" min="0" step="10" inputMode="numeric" value={intakeCalories} onChange={(event) => setIntakeCalories(event.target.value)} placeholder="—" /></label><label className="field-control"><span>پروتئین <small>گرم</small></span><input type="number" min="0" step="1" value={intakeProtein} onChange={(event) => setIntakeProtein(event.target.value)} placeholder="—" /></label><label className="field-control"><span>کربوهیدرات <small>گرم</small></span><input type="number" min="0" step="1" value={intakeCarbs} onChange={(event) => setIntakeCarbs(event.target.value)} placeholder="—" /></label><label className="field-control"><span>چربی <small>گرم</small></span><input type="number" min="0" step="1" value={intakeFats} onChange={(event) => setIntakeFats(event.target.value)} placeholder="—" /></label></div>
            <label className="field-control"><span>یادداشت خوراک <small>اختیاری</small></span><textarea rows={5} value={foodNotes} onChange={(event) => setFoodNotes(event.target.value)} placeholder="وعده‌ها، اشتها یا نکته‌ای برای یادآوری…" /></label>
            {dayError && <p className="form-error" role="alert">{dayError}</p>}
            <button className="button button--secondary button--full" type="submit">{daySaved ? <><Check size={16} /> ثبت امروز ذخیره شد</> : <><Save size={16} /> ذخیرهٔ ثبت امروز</>}</button>
          </form>
        </section>
      </div>

      <section className="panel-card recent-nutrition-card"><div className="section-heading"><div><span className="eyebrow">یادداشت‌های اخیر</span><h2>سوابق ثبت خوراک</h2></div><span className="small-count">{faNumber(lastSevenDays.length)} روز</span></div>
        {lastSevenDays.length ? <div className="nutrition-history-list">{lastSevenDays.map((day) => <div className="nutrition-history-row" key={day.id}><span className="nutrition-history-date">{formatDate(`${day.date}T00:00:00`, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="nutrition-history-summary">{day.proteinG !== undefined ? `${faNumber(day.proteinG)} گرم پروتئین` : 'درشت‌مغذی ثبت نشده'}{day.calories !== undefined ? ` · ${faNumber(day.calories)} کیلوکالری` : ''}</span><span className="nutrition-history-note">{day.notes || '—'}</span></div>)}</div> : <p className="muted small-text">بعد از ثبت اولین یادداشت روزانه، سوابق اخیر اینجا نمایش داده می‌شوند.</p>}
      </section>
    </div>
  );
}
