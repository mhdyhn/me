import { useEffect, useState } from 'react';
import { Check, Download, Info, LockKeyhole, Save, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { RouteLoading } from '../components/RouteLoading';
import { InstallAppModal } from '../components/InstallAppModal';
import { PersonalDataPanel } from '../components/PersonalDataPanel';
import { FormerCoachRecords } from '../components/FormerCoachRecords';
import { DraftConflictNotice } from '../components/DraftConflictNotice';
import { useGuardedDraft } from '../components/useGuardedDraft';
import { DraftChangedError } from '../lib/draftGuard';
import { useGym } from '../context/GymProvider';
import { db } from '../lib/db';
import { faNumber } from '../lib/format';
import { ApiError, api } from '../lib/api';
import { useSession } from '../context/SessionContext';
import type { UserProfile } from '../types';

export function Settings() {
  const { profile, sessions, bodyweights, nutritionDays, nutritionGoals, saveProfile, loading } = useGym();
  const { user } = useSession();
  const hasCoach = user?.role === 'student' && user.coachId !== null && user.coachAccess !== false;
  const profileDraft = useGuardedDraft(profile);
  const { draft, setDraft } = profileDraft;
  const [shareWithCoach, setShareWithCoach] = useState(false);
  const [serverSharing, setServerSharing] = useState<boolean | null>(null);
  const [sharingLoaded, setSharingLoaded] = useState(false);
  const [sharingLoadError, setSharingLoadError] = useState('');
  const [sharingReload, setSharingReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [backupError, setBackupError] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);


  useEffect(() => {
    let active = true;
    if (!hasCoach || !user) { setSharingLoaded(true); return () => { active = false; }; }
    setSharingLoaded(false);
    setSharingLoadError('');
    api<{ stored: { profile: UserProfile; shareWithCoach: boolean } | null }>('GET', `/me/profile?accountId=${user.id}`)
      .then(({ stored }) => {
        if (!active) return;
        const shared = stored?.shareWithCoach ?? false;
        setServerSharing(shared);
        setShareWithCoach(shared);
      })
      .catch((caught) => {
        if (active) setSharingLoadError(caught instanceof ApiError ? caught.message : 'وضعیت همگام‌سازی با سرور بارگذاری نشد.');
      })
      .finally(() => { if (active) setSharingLoaded(true); });
    return () => { active = false; };
  }, [user?.id, hasCoach, sharingReload]);

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileDraft.conflict) { setError('ابتدا نسخهٔ تازه و پیش‌نویس را بررسی کن.'); return; }
    if (!Number.isFinite(draft.age) || draft.age < 13 || draft.age > 100) { setError('سن را بین ۱۳ تا ۱۰۰ وارد کن.'); return; }
    if (!Number.isFinite(draft.heightCm) || draft.heightCm < 100 || draft.heightCm > 250) { setError('قد باید بین ۱۰۰ تا ۲۵۰ سانتی‌متر باشد.'); return; }
    if (!Number.isFinite(draft.weightKg) || draft.weightKg < 30 || draft.weightKg > 300) { setError('وزن پروفایل باید بین ۳۰ تا ۳۰۰ کیلوگرم باشد.'); return; }
    try {
      const storedLocally = await saveProfile(draft, profileDraft.base);
      if (storedLocally === false) { setError('پروفایل در حافظهٔ دستگاه ذخیره نشد و ممکن است پس از بازکردن دوباره از دست برود.'); return; }
      // Sharing consent is separate from private sync and must never be guessed while offline.
      if (hasCoach && user && sharingLoaded && !sharingLoadError && serverSharing !== null && serverSharing !== shareWithCoach) {
        try {
          if (shareWithCoach) await api('PUT', '/me/profile', { accountId: user.id, profile: draft, shareWithCoach: true });
          else await api('POST', '/me/profile/sharing', { accountId: user.id, shareWithCoach: false });
          setServerSharing(shareWithCoach);
        } catch {
          setError(shareWithCoach
            ? 'پروفایل روی دستگاه ذخیره شد، اما اشتراک با مربی فعال نشد؛ برای تغییر اشتراک دوباره تلاش کن.'
            : 'پروفایل روی دستگاه ذخیره شد، اما قطع اشتراک در سرور انجام نشد؛ تا اتصال و تأیید سرور، مربی ممکن است همچنان دسترسی داشته باشد.');
          return;
        }
      }
      setError(''); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (caught) {
      setError(caught instanceof DraftChangedError ? caught.message : caught instanceof ApiError ? caught.message : 'ذخیرهٔ پروفایل انجام نشد.');
    }
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

  if (loading) return <RouteLoading />;

  return (
    <div className="page-stack settings-page">
      <SectionHeading eyebrow="پروفایل تمرینی" title="برنامه را برای خودت تنظیم کن." description={hasCoach ? 'پروفایل به حساب تو همگام می‌شود؛ اشتراک با مربی جداگانه و اختیاری است.' : 'پروفایل و تنظیمات شخصی پس از اتصال با حساب تو همگام می‌شوند.'} />
      <PersonalDataPanel />
      {user?.role === 'student' && user.coachId !== null && <FormerCoachRecords key={`${user.id}:${user.coachId}`} />}
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
          {hasCoach && (
            <label className="student-onboarding__consent settings-profile-consent">
              <input type="checkbox" checked={shareWithCoach} disabled={!sharingLoaded || Boolean(sharingLoadError)} onChange={(event) => setShareWithCoach(event.target.checked)} />
              <span><strong>نمایش پروفایل به مربی</strong><small>{sharingLoadError ? 'تا دریافت وضعیت معتبر، تغییر اشتراک غیرفعال است؛ ذخیرهٔ محلی ممکن است. اگر پیش‌تر اشتراک فعال بوده، مربی پس از همگام‌سازی ممکن است نسخهٔ تازه را ببیند.' : sharingLoaded ? 'با روشن‌کردن و ذخیره، پروفایل به حساب فرستاده و با مربی فعلی به اشتراک گذاشته می‌شود؛ خاموش‌کردن و ذخیره، دسترسی را قطع می‌کند.' : 'در حال بارگذاری وضعیت اشتراک…'}</small></span>
            </label>
          )}
          {hasCoach && sharingLoadError && (
            <div className="settings-sync-retry" role="alert">
              <p className="form-error">{sharingLoadError}</p>
              <button type="button" className="button button--secondary button--small" onClick={() => setSharingReload((attempt) => attempt + 1)}>
                تلاش دوباره برای بارگذاری
              </button>
            </div>
          )}
          {profileDraft.conflict && <DraftConflictNotice latest={profile} discard={profileDraft.discard} acceptCurrent={profileDraft.acceptCurrent} />}
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
          <section className="panel-card privacy-card"><span className="privacy-icon"><LockKeyhole size={17} /></span><span className="eyebrow">حریم خصوصی</span><h3>داده‌های تو، انتخاب تو.</h3><p>{hasCoach ? 'پروفایل با حساب همگام می‌شود؛ مربی فقط با فعال‌کردن اشتراک آن را می‌بیند. داده‌های همگام‌نشده با پاک‌کردن مرورگر از دست می‌روند.' : 'پروفایل و گزارش‌های شخصی به حساب همگام می‌شوند؛ داده‌های همگام‌نشده ممکن است با پاک‌کردن مرورگر از دست بروند.'}</p><div className="privacy-points">{hasCoach && <span><ShieldCheck size={14} /> اشتراک پروفایل با مربی قابل مدیریت است</span>}<span><ShieldCheck size={14} /> فایل پشتیبان را در جای امن نگه دار</span></div><button className="button button--secondary button--full" onClick={() => void exportBackup()}><Download size={16} /> دریافت نسخهٔ پشتیبان</button><small className="field-hint">JSON شامل پروفایل، هدف‌های تغذیه، جلسه‌ها، وزن و یادداشت‌های محلی است؛ برنامه، گفت‌وگو و دفتر خوراک سرور را ندارد. بازیابی خودکار در برنامه وجود ندارد.</small>{backupError && <p className="form-error" role="alert">{backupError}</p>}</section>
        </aside>
      </div>
      <div className="settings-disclaimer"><Info size={16} /><span>راهنمای تمرین عمومی و آموزشی است و جایگزین توصیهٔ پزشکی یا تشخیص فردی نیست. حرکت‌ها را متناسب با توانت تنظیم کن و برای درد یا پرسش سلامت از متخصص کمک بگیر.</span></div>
      <p className="muted small-text">شناسهٔ نسخهٔ رابط در این دستگاه: <code dir="ltr">{typeof __MEETY_WEB_REVISION__ === 'string' ? __MEETY_WEB_REVISION__ : 'نامشخص'}</code></p>
      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
