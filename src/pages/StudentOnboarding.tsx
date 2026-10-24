import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Dumbbell, HeartPulse, UserRound } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useGym } from '../context/GymProvider';
import type { UserProfile } from '../types';

const GOALS = ['کاهش چربی', 'افزایش تودهٔ عضلانی', 'افزایش قدرت', 'بهبود آمادگی و سلامتی', 'شروع منظم تمرین'];
const ACTIVITIES = ['کم‌تحرک · بیشتر روز نشسته', 'فعالیت سبک', 'فعالیت متوسط', 'فعالیت زیاد'];
const EQUIPMENT = ['باشگاه کامل', 'دمبل و تجهیزات محدود', 'تمرین در خانه بدون وسیله', 'سایر'];

function StepFrame({ step, title, subtitle, children }: { step: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="student-onboarding panel-card" aria-labelledby="onboarding-title">
      <div className="student-onboarding__top">
        <span className="student-onboarding__eyebrow">شروع میتی · گام {step} از ۳</span>
        <div className="student-onboarding__progress" aria-label={`گام ${step} از ۳`}>
          {[1, 2, 3].map((item) => <span key={item} className={item <= step ? 'is-complete' : ''} />)}
        </div>
      </div>
      <h1 id="onboarding-title">{title}</h1>
      <p className="muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field-control"><span>{label}</span>{children}</label>;
}

/** A short, editable student intake that uses Meety's existing profile fields. */
export function StudentOnboarding({ onDismiss }: { onDismiss: () => void }) {
  const { profile, saveProfile } = useGym();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof UserProfile,>(key: K, value: UserProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const finish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (step < 3) {
      setStep((current) => current + 1);
      return;
    }
    if (!Number.isFinite(draft.age) || draft.age < 13 || draft.age > 100) { setError('سن را بین ۱۳ تا ۱۰۰ سال وارد کن.'); return; }
    if (!Number.isFinite(draft.heightCm) || draft.heightCm < 100 || draft.heightCm > 250) { setError('قد را بین ۱۰۰ تا ۲۵۰ سانتی‌متر وارد کن.'); return; }
    if (!Number.isFinite(draft.weightKg) || draft.weightKg < 30 || draft.weightKg > 300) { setError('وزن را بین ۳۰ تا ۳۰۰ کیلوگرم وارد کن.'); return; }
    setSaving(true);
    try {
      try {
        await api('PUT', '/me/profile', { profile: draft, shareWithCoach: true });
      } catch (caught) {
        setError(caught instanceof ApiError ? `${caught.message} اتصال را بررسی کن و دوباره ذخیره کن.` : 'همگام‌سازی با حساب انجام نشد. اتصال را بررسی کن و دوباره تلاش کن.');
        return;
      }
      await saveProfile(draft);
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="student-onboarding-wrap">
      <StepFrame
        step={step}
        title={step === 1 ? 'از کجا شروع می‌کنی؟' : step === 2 ? 'تمرینت چه شکلی باشد؟' : 'چه چیزهایی را در نظر بگیریم؟'}
        subtitle={step === 1 ? 'چند اطلاعات پایه وارد کن؛ هر زمان خواستی از تنظیمات می‌توانی ویرایششان کنی.' : step === 2 ? 'برنامهٔ زمانی و امکاناتی را که واقعاً در اختیار داری مشخص کن.' : 'این اطلاعات برای شناخت بهتر شرایط تمرینت است؛ تشخیص پزشکی نیست.'}
      >
        <form className="student-onboarding__form" onSubmit={(event) => void finish(event)}>
          {step === 1 && <>
            <div className="student-onboarding__section-title"><UserRound size={18} /><strong>مشخصات و هدفت</strong></div>
            <div className="student-onboarding__fields">
              <Field label="سن"><input type="number" min="13" max="100" value={draft.age || ''} onChange={(event) => update('age', Number(event.target.value))} required /></Field>
              <Field label="جنسیت (اختیاری)"><select value={draft.sex} onChange={(event) => update('sex', event.target.value)}><option value="">ترجیح می‌دهم نگویم</option><option value="مرد">مرد</option><option value="زن">زن</option></select></Field>
              <Field label="قد · سانتی‌متر"><input type="number" min="100" max="250" value={draft.heightCm || ''} onChange={(event) => update('heightCm', Number(event.target.value))} required /></Field>
              <Field label="وزن فعلی · کیلوگرم"><input type="number" min="30" max="300" step="0.1" value={draft.weightKg || ''} onChange={(event) => update('weightKg', Number(event.target.value))} required /></Field>
              <Field label="هدف اصلی"><select value={GOALS.includes(draft.primaryGoal) ? draft.primaryGoal : ''} onChange={(event) => update('primaryGoal', event.target.value)} required><option value="" disabled>هدفت را انتخاب کن</option>{GOALS.map((goal) => <option key={goal} value={goal}>{goal}</option>)}</select></Field>
              <Field label="هدف تکمیلی · اختیاری"><input value={draft.secondaryGoal} maxLength={100} onChange={(event) => update('secondaryGoal', event.target.value)} placeholder="مثلاً بهبود استقامت" /></Field>
            </div>
          </>}
          {step === 2 && <>
            <div className="student-onboarding__section-title"><Dumbbell size={18} /><strong>زمان و امکانات تمرین</strong></div>
            <div className="student-onboarding__fields">
              <Field label="سابقهٔ تمرین"><input value={draft.trainingExperience} maxLength={120} onChange={(event) => update('trainingExperience', event.target.value)} placeholder="مثلاً تازه‌کار یا حدود یک سال" /></Field>
              <Field label="روز تمرین در هفته"><input type="number" min="1" max="7" value={draft.trainingDays || ''} onChange={(event) => update('trainingDays', Number(event.target.value))} required /></Field>
              <Field label="زمان هر جلسه · دقیقه"><input type="number" min="15" max="240" step="5" value={draft.sessionMinutes || ''} onChange={(event) => update('sessionMinutes', Number(event.target.value))} required /></Field>
              <Field label="تجهیزات در دسترس"><select value={EQUIPMENT.includes(draft.equipment) ? draft.equipment : ''} onChange={(event) => update('equipment', event.target.value)}><option value="">انتخاب کن</option>{EQUIPMENT.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
            </div>
          </>}
          {step === 3 && <>
            <div className="student-onboarding__section-title"><HeartPulse size={18} /><strong>سبک زندگی و محدودیت‌ها</strong></div>
            <div className="student-onboarding__fields">
              <Field label="میزان فعالیت روزانه"><select value={ACTIVITIES.includes(draft.dailyActivity) ? draft.dailyActivity : ''} onChange={(event) => update('dailyActivity', event.target.value)}><option value="">انتخاب کن</option>{ACTIVITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
              <Field label="میزان خواب معمول"><input value={draft.sleepHours} maxLength={40} onChange={(event) => update('sleepHours', event.target.value)} placeholder="مثلاً ۷ تا ۸ ساعت" /></Field>
              <Field label="آسیب‌دیدگی یا محدودیت · اختیاری"><textarea rows={3} value={draft.injuries} maxLength={500} onChange={(event) => update('injuries', event.target.value)} placeholder="اگر موردی هست بنویس؛ در صورت درد یا نگرانی با متخصص مشورت کن." /></Field>
            </div>
            <p className="student-onboarding__privacy">پس از ذخیره، پروفایل به‌طور خودکار با حساب همگام می‌شود و برای مربی فعلی‌ات قابل مشاهده است. هر زمان بخواهی می‌توانی اشتراک را از تنظیمات قطع کنی.</p>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="student-onboarding__actions">
            {step > 1 && <button type="button" className="button button--ghost" onClick={() => { setError(''); setStep((current) => current - 1); }}><ArrowRight size={16} /> قبلی</button>}
            <button type="submit" className="button button--primary" disabled={saving}>
              {step === 3 ? <><Check size={16} /> {saving ? 'در حال ذخیره…' : 'ذخیره و ادامه'}</> : <>ادامه <ArrowLeft size={16} /></>}
            </button>
            <button type="button" className="student-onboarding__skip" onClick={onDismiss}>بعداً تکمیل می‌کنم</button>
          </div>

        </form>
      </StepFrame>
    </div>
  );
}
