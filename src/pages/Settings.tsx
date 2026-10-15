import { useEffect, useState } from 'react';
import { Check, Download, Info, LockKeyhole, Save, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { InstallAppModal } from '../components/InstallAppModal';
import { useGym } from '../context/GymProvider';
import { db } from '../lib/db';
import { faNumber } from '../lib/format';
import type { UserProfile } from '../types';

export function Settings() {
  const { profile, sessions, bodyweights, nutritionDays, nutritionGoals, saveProfile } = useGym();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [backupError, setBackupError] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);

  useEffect(() => setDraft(profile), [profile]);

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isFinite(draft.age) || draft.age < 13 || draft.age > 100) { setError('سن را بین ۱۳ تا ۱۰۰ وارد کن.'); return; }
    if (!Number.isFinite(draft.heightCm) || draft.heightCm < 100 || draft.heightCm > 250) { setError('قد باید بین ۱۰۰ تا ۲۵۰ سانتی‌متر باشد.'); return; }
    if (!Number.isFinite(draft.weightKg) || draft.weightKg < 30 || draft.weightKg > 300) { setError('وزن پروفایل باید بین ۳۰ تا ۳۰۰ کیلوگرم باشد.'); return; }
    await saveProfile(draft);
    setError(''); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
  };

  const exportBackup = async () => {
    try {
      const [storedProfile, storedGoals] = await Promise.all([db.preferences.get('profile'), db.preferences.get('nutritionGoals')]);
      const content = JSON.stringify({ app: 'Meety', schemaVersion: 1, exportedAt: new Date().toISOString(), profile: storedProfile?.value ?? profile, nutritionGoals: storedGoals?.value ?? nutritionGoals, sessions, bodyweights, nutritionDays }, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `meety-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupError('');
    } catch (backupFailure) {
      console.error('Could not export the local Meety backup.', backupFailure);
      setBackupError('خواندن اطلاعات محلی برای پشتیبان‌گیری ممکن نشد. مجوز ذخیره‌سازی مرورگر را بررسی کن.');
    }
  };

  return (
    <div className="page-stack settings-page">
      <SectionHeading eyebrow="پروفایل شما · خصوصی از ابتدا" title="برنامه را برای خودت تنظیم کن." description="این اطلاعات به تناسب برنامهٔ تمرینی کمک می‌کند. داده‌ها در همین مرورگر ذخیره می‌شوند." />
      <div className="settings-layout">
        <form className="settings-form panel-card" onSubmit={(event) => void submit(event)}>
          <div className="card-topline"><div><span className="eyebrow">پروفایل تمرینی</span><h2>دربارهٔ تو.</h2></div><UserRound size={18} className="icon-accent" /></div>
          <div className="settings-fields-grid">
            <label className="field-control"><span>سن</span><input type="number" min="13" max="100" value={draft.age} onChange={(event) => update('age', Number(event.target.value))} required /></label>
            <label className="field-control"><span>جنسیت</span><select value={draft.sex} onChange={(event) => update('sex', event.target.value)}><option value="مرد">مرد</option><option value="زن">زن</option><option value="ترجیح می‌دهم نگویم">ترجیح می‌دهم نگویم</option></select></label>
            <label className="field-control"><span>قد <small>سانتی‌متر</small></span><input type="number" min="100" max="250" value={draft.heightCm} onChange={(event) => update('heightCm', Number(event.target.value))} required /></label>
            <label className="field-control"><span>وزن پروفایل <small>کیلوگرم</small></span><input type="number" min="30" max="300" step="0.1" value={draft.weightKg} onChange={(event) => update('weightKg', Number(event.target.value))} required /></label>
            <label className="field-control"><span>هدف اصلی</span><input value={draft.primaryGoal} onChange={(event) => update('primaryGoal', event.target.value)} required /></label>
            <label className="field-control"><span>هدف دوم</span><input value={draft.secondaryGoal} onChange={(event) => update('secondaryGoal', event.target.value)} /></label>
            <label className="field-control"><span>روزهای تمرین در هفته</span><input type="number" min="1" max="7" value={draft.trainingDays} onChange={(event) => update('trainingDays', Number(event.target.value))} /></label>
            <label className="field-control"><span>حداکثر زمان جلسه <small>دقیقه</small></span><input type="number" min="20" max="180" value={draft.sessionMinutes} onChange={(event) => update('sessionMinutes', Number(event.target.value))} /></label>
            <label className="field-control"><span>سابقهٔ تمرین</span><input value={draft.trainingExperience} onChange={(event) => update('trainingExperience', event.target.value)} /></label>
            <label className="field-control"><span>خواب</span><input value={draft.sleepHours} onChange={(event) => update('sleepHours', event.target.value)} /></label>
            <label className="field-control"><span>فعالیت روزانه</span><input value={draft.dailyActivity} onChange={(event) => update('dailyActivity', event.target.value)} /></label>
            <label className="field-control"><span>سطح استرس <small>۱ تا ۱۰</small></span><input type="number" min="1" max="10" value={draft.stressLevel} onChange={(event) => update('stressLevel', Number(event.target.value))} /></label>
            <label className="field-control field-control--wide"><span>آسیب‌دیدگی یا محدودیت</span><textarea rows={3} value={draft.injuries} onChange={(event) => update('injuries', event.target.value)} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="settings-save-row"><span className="field-hint">تغییرات، ست‌های ثبت‌شدهٔ قبلی را عوض نمی‌کنند.</span><button className="button button--primary" type="submit">{saved ? <><Check size={16} /> ذخیره شد</> : <><Save size={16} /> ذخیرهٔ پروفایل</>}</button></div>
        </form>

        <aside className="settings-aside page-stack page-stack--tight">
          <section className="panel-card install-card" style={{ border: '1px solid rgba(217, 246, 111, 0.25)', background: 'linear-gradient(135deg, rgba(217, 246, 111, 0.06), transparent)' }}>
            <div className="card-topline">
              <div>
                <span className="eyebrow">برنامه روی گوشی</span>
                <h3>نصب اپلیکیشن میتی</h3>
              </div>
              <Smartphone size={18} className="icon-accent" />
            </div>
            <p className="muted small-text">
              میتی را به صورت تمام‌صفحه روی گوشی اندروید یا آیفون خود نصب کنید تا سریع و بدون نوار مرورگر باز شود.
            </p>
            <button
              type="button"
              className="button button--primary button--full"
              onClick={() => setShowInstallModal(true)}
            >
              <Smartphone size={16} /> نصب اپلیکیشن روی گوشی
            </button>
          </section>

          <section className="panel-card references-card"><div className="card-topline"><div><span className="eyebrow">وزنه‌های کاری گزارش‌شده</span><h3>فقط برای شناخت نقطهٔ شروع.</h3></div><Info size={17} className="icon-muted" /></div><p className="muted small-text">این اعداد فقط برآورد تقریبی وزنهٔ کاری پروفایل هستند؛ نه رکورد یک‌تکرار بیشینه و نه عملکرد ثبت‌شده. تعداد ست، تکرار، نوع حرکت و شیوهٔ نمایش وزنه در دستگاه تأیید نشده‌اند. هر وزنه را در باشگاه بررسی کن.</p><div className="reference-list">{draft.workingWeightReferences.map((reference) => <div key={reference.label}><strong>{reference.label}</strong><span>حدود {faNumber(reference.weightKg)} کیلوگرم</span><small>{reference.note}</small></div>)}</div></section>
          <section className="panel-card privacy-card"><span className="privacy-icon"><LockKeyhole size={17} /></span><span className="eyebrow">ذخیره‌سازی محلی</span><h3>داده‌ها همین‌جا می‌مانند.</h3><p>ست‌ها، سوابق تمرین، وزن‌کشی و یادداشت‌های تغذیه در IndexedDB همین مرورگر ذخیره می‌شوند. پاک‌کردن داده‌های مرورگر ممکن است آن‌ها را حذف کند.</p><div className="privacy-points"><span><ShieldCheck size={14} /> حساب کاربری یا همگام‌سازی ابری تنظیم نشده است</span><span><ShieldCheck size={14} /> بدون آمارگیری یا ردیابی شخص ثالث</span></div><button className="button button--secondary button--full" onClick={() => void exportBackup()}><Download size={16} /> دریافت نسخهٔ پشتیبان</button><small className="field-hint">یک فایل JSON از پروفایل و گزارش‌ها دریافت می‌کنی.</small>{backupError && <p className="form-error" role="alert">{backupError}</p>}</section>
        </aside>
      </div>
      <div className="settings-disclaimer"><Info size={16} /><span>راهنمای تمرین عمومی و آموزشی است و جایگزین توصیهٔ پزشکی یا تشخیص فردی نیست. حرکت‌ها را متناسب با توانت تنظیم کن و برای درد یا پرسش سلامت از متخصص کمک بگیر.</span></div>
      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
