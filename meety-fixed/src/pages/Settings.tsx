import { useEffect, useState } from 'react';
import { Check, Database, Download, Info, LockKeyhole, RefreshCw, Save, ShieldCheck, Trash2, Upload, UserRound } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { db } from '../lib/db';
import { exportBackup, importBackup, readBackupFile } from '../lib/backup';
import { faNumber } from '../lib/format';
import type { UserProfile } from '../types';

export function Settings() {
  const { profile, saveProfile, resetAllData, runStorageHealthCheck } = useGym();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupMode, setBackupMode] = useState<'replace' | 'merge'>('replace');
  const [storageMessage, setStorageMessage] = useState('');
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => setDraft(profile), [profile]);
  useEffect(() => {
    void db.preferences.get('lastBackupAt').then((row) => setLastBackupAt(typeof row?.value === 'string' ? row.value : null));
  }, []);

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!Number.isFinite(draft.age) || draft.age < 13 || draft.age > 100) { setError('سن را بین ۱۳ تا ۱۰۰ وارد کن.'); return; }
    if (!Number.isFinite(draft.heightCm) || draft.heightCm < 100 || draft.heightCm > 250) { setError('قد باید بین ۱۰۰ تا ۲۵۰ سانتی‌متر باشد.'); return; }
    if (!Number.isFinite(draft.weightKg) || draft.weightKg < 30 || draft.weightKg > 300) { setError('وزن پروفایل باید بین ۳۰ تا ۳۰۰ کیلوگرم باشد.'); return; }
    await saveProfile(draft);
    setError(''); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
  };

  const exportCurrentBackup = async () => {
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `meety-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      await db.preferences.put({ key: 'lastBackupAt', value: new Date().toISOString() });
      setLastBackupAt(new Date().toISOString());
      setBackupError('');
    } catch (failure) {
      console.error('Could not export the local Meety backup.', failure);
      setBackupError('ساخت نسخهٔ پشتیبان ممکن نشد.');
    }
  };

  const importBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = await readBackupFile(file);
      await importBackup(payload, backupMode);
      window.location.reload();
    } catch (failure) {
      console.error('Could not import the local Meety backup.', failure);
      setBackupError(failure instanceof Error ? failure.message : 'خواندن فایل پشتیبان ممکن نشد.');
    }
  };

  const healthCheck = async () => {
    const ok = await runStorageHealthCheck();
    setStorageMessage(ok ? 'ذخیره‌سازی محلی سالم است.' : 'ذخیره‌سازی محلی قابل اتکا نیست؛ پیش از ادامه، از اطلاعاتت پشتیبان بگیر.');
  };

  const removeAll = async () => {
    if (!window.confirm('همهٔ تمرین‌ها، سوابق، وزن‌ها و داده‌های تغذیه حذف شوند؟ این کار قابل بازگشت نیست.')) return;
    await resetAllData();
    window.location.reload();
  };

  const backupIsOld = !lastBackupAt || Date.now() - new Date(lastBackupAt).getTime() > 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="page-stack settings-page">
      <SectionHeading eyebrow="پروفایل شما · خصوصی از ابتدا" title="برنامه را برای خودت تنظیم کن." description="این اطلاعات برای تنظیم برنامه استفاده می‌شود. داده‌ها در همین مرورگر ذخیره می‌شوند." />
      {backupIsOld && <div className="settings-disclaimer"><Info size={16} /><span>بیش از ۷ روز است که پشتیبان نگرفته‌ای. برای جلوگیری از از دست‌رفتن داده‌های محلی، یک نسخهٔ JSON ذخیره کن.</span></div>}

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
            <label className="field-control"><span>روزهای تمرین در هفته</span><input type="number" min="1" max="6" value={draft.trainingDays} onChange={(event) => update('trainingDays', Number(event.target.value))} /></label>
            <label className="field-control"><span>حداکثر زمان جلسه <small>دقیقه</small></span><input type="number" min="20" max="180" value={draft.sessionMinutes} onChange={(event) => update('sessionMinutes', Number(event.target.value))} /></label>
            <label className="field-control"><span>سابقهٔ تمرین</span><input value={draft.trainingExperience} onChange={(event) => update('trainingExperience', event.target.value)} /></label>
            <label className="field-control"><span>خواب</span><input value={draft.sleepHours} onChange={(event) => update('sleepHours', event.target.value)} /></label>
            <label className="field-control"><span>فعالیت روزانه</span><input value={draft.dailyActivity} onChange={(event) => update('dailyActivity', event.target.value)} /></label>
            <label className="field-control"><span>سطح استرس <small>۱ تا ۱۰</small></span><input type="number" min="1" max="10" value={draft.stressLevel} onChange={(event) => update('stressLevel', Number(event.target.value))} /></label>
            <label className="field-control field-control--wide"><span>آسیب‌دیدگی یا محدودیت</span><textarea rows={4} value={draft.injuries} onChange={(event) => update('injuries', event.target.value)} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="settings-save-row"><span className="field-hint">تغییرات پروفایل، ست‌های ثبت‌شدهٔ قبلی را عوض نمی‌کنند.</span><button className="button button--primary" type="submit">{saved ? <><Check size={16} /> ذخیره شد</> : <><Save size={16} /> ذخیرهٔ پروفایل</>}</button></div>
        </form>

        <aside className="settings-aside page-stack page-stack--tight">
          <section className="panel-card references-card"><div className="card-topline"><div><span className="eyebrow">وزنه‌های کاری گزارش‌شده</span><h3>فقط برای شناخت نقطهٔ شروع.</h3></div><Info size={17} className="icon-muted" /></div><p className="muted small-text">این اعداد فقط برآورد تقریبی وزنهٔ کاری پروفایل هستند؛ نه رکورد یک‌تکرار بیشینه و نه عملکرد ثبت‌شده. هر وزنه را در باشگاه بررسی کن.</p><div className="reference-list">{draft.workingWeightReferences.map((reference) => <div key={reference.label}><strong>{reference.label}</strong><span>حدود {faNumber(reference.weightKg)} کیلوگرم</span><small>{reference.note}</small></div>)}</div></section>
          <section className="panel-card privacy-card"><span className="privacy-icon"><LockKeyhole size={17} /></span><span className="eyebrow">ذخیره‌سازی محلی</span><h3>داده‌ها همین‌جا می‌مانند.</h3><p>ست‌ها، سوابق تمرین، وزن‌کشی و یادداشت‌های تغذیه در IndexedDB همین مرورگر ذخیره می‌شوند.</p><div className="privacy-points"><span><ShieldCheck size={14} /> بدون حساب کاربری یا همگام‌سازی ابری</span><span><ShieldCheck size={14} /> بدون آمارگیری شخص ثالث</span></div>
            <div className="backup-actions">
              <button className="button button--secondary button--full" type="button" onClick={() => void exportCurrentBackup()}><Download size={16} /> دریافت نسخهٔ پشتیبان</button>
              <div className="backup-import-options"><label><input type="radio" checked={backupMode === 'replace'} onChange={() => setBackupMode('replace')} /> جایگزینی</label><label><input type="radio" checked={backupMode === 'merge'} onChange={() => setBackupMode('merge')} /> ادغام</label></div>
              <label className="button button--secondary button--full"><Upload size={16} /> واردکردن پشتیبان<input hidden type="file" accept="application/json,.json" onChange={(event) => void importBackupFile(event)} /></label>
            </div>
            <small className="field-hint">آخرین نسخه: {lastBackupAt ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastBackupAt)) : 'ثبت نشده'}</small>
            {backupError && <p className="form-error" role="alert">{backupError}</p>}
          </section>
          <section className="panel-card privacy-card">
            <div className="card-topline"><div><span className="eyebrow">ابزار نگهداری</span><h3>سلامت ذخیره‌سازی</h3></div><Database size={17} className="icon-muted" /></div>
            <button className="button button--secondary button--full" type="button" onClick={() => void healthCheck()}><RefreshCw size={16} /> اجرای تست ذخیره‌سازی</button>
            {storageMessage && <p className="field-hint">{storageMessage}</p>}
            <button className="button button--danger button--full" type="button" onClick={() => void removeAll()}><Trash2 size={16} /> حذف همهٔ داده‌ها</button>
          </section>
        </aside>
      </div>
      <div className="settings-disclaimer"><Info size={16} /><span>راهنمای تمرین عمومی و آموزشی است و جایگزین تشخیص یا توصیهٔ پزشکی نیست. با توجه به سابقهٔ شانه، حرکات دردناک یا محدودکننده را متوقف کن و دامنهٔ حرکت و انتخاب حرکت را با متخصص بررسی کن.</span></div>
    </div>
  );
}
