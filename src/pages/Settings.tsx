import { useEffect, useRef, useState } from 'react';
import { Check, Download, Info, LockKeyhole, Plus, Save, ShieldCheck, Smartphone, Trash2, UserRound } from 'lucide-react';
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
import { schedulePersonalSync } from '../lib/personalSync';
import { useSession } from '../context/SessionContext';
import type { UserProfile } from '../types';

export function Settings() {
  const { profile, sessions, bodyweights, nutritionDays, nutritionGoals, saveProfile, loading } = useGym();
  const { user } = useSession();
  const hasCoach = user?.role === 'student' && user.coachId !== null && user.coachAccess !== false;
  const profileDraft = useGuardedDraft(profile);
  const { draft, setDraft } = profileDraft;
  const referencesValid = Array.isArray(draft.workingWeightReferences) && draft.workingWeightReferences.every((item) =>
    item && typeof item.label === 'string' && typeof item.weightKg === 'number' && typeof item.note === 'string');
  const references = referencesValid ? draft.workingWeightReferences : [];
  const [shareWithCoach, setShareWithCoach] = useState(false);
  const [serverSharing, setServerSharing] = useState<boolean | null>(null);
  const [sharingVersion, setSharingVersion] = useState<number | null>(null);
  const [sharingLoaded, setSharingLoaded] = useState(false);
  const [sharingLoadError, setSharingLoadError] = useState('');
  const [sharingReload, setSharingReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [backupError, setBackupError] = useState('');
  const [showInstallModal, setShowInstallModal] = useState(false);


  useEffect(() => {
    let active = true;
    if (!hasCoach || !user) { setSharingLoaded(true); return () => { active = false; }; }
    setSharingLoaded(false);
    setSharingLoadError('');
    api<{ stored: { profile: UserProfile; shareWithCoach: boolean } | null; sharingVersion: number }>('GET', `/me/profile?accountId=${user.id}`)
      .then((result) => {
        if (!active) return;
        if (!result || !('stored' in result) || !Number.isSafeInteger(result.sharingVersion) || result.sharingVersion < 0 || (result.stored !== null && typeof result.stored?.shareWithCoach !== 'boolean')) {
          throw new Error('Invalid sharing status');
        }
        const shared = result.stored?.shareWithCoach ?? false;
        setServerSharing(shared);
        setSharingVersion(result.sharingVersion);
        setShareWithCoach(shared);
      })
      .catch((caught) => {
        if (active) setSharingLoadError(caught instanceof ApiError ? caught.message : 'وضعیت همگام‌سازی با سرور بارگذاری نشد.');
      })
      .finally(() => { if (active) setSharingLoaded(true); });
    return () => { active = false; };
  }, [user?.id, hasCoach, sharingReload]);

  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setSaved(false); setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (hasCoach && (!sharingLoaded || sharingLoadError || serverSharing === null || sharingVersion === null)) {
      setError('برای جلوگیری از اشتراک ناخواسته، ابتدا وضعیت دسترسی مربی را بررسی کن. پیش‌نویس در همین صفحه باقی می‌ماند و هنوز ذخیره نشده است.');
      return;
    }
    savingRef.current = true; setSaving(true);
    let revoked = false;
    try {
      // Revoke first. No new profile data may be saved/synced while the old consent is still on.
      if (hasCoach && user && !shareWithCoach) {
        try {
          const result = await api<{ shareWithCoach: boolean; sharingVersion: number }>('POST', '/me/profile/sharing', { accountId: user.id, shareWithCoach: false });
          if (result.shareWithCoach !== false || !Number.isSafeInteger(result.sharingVersion) || result.sharingVersion < 0) throw new Error('Revocation was not confirmed');
          setServerSharing(false); setSharingVersion(result.sharingVersion); revoked = true;
        } catch {
          setSharingLoadError('وضعیت اشتراک در سرور تأیید نشد.');
          setError('قطع اشتراک تأیید نشد و مربی ممکن است همچنان دسترسی داشته باشد. تغییرات پروفایل ذخیره نشد؛ پیش‌نویس را در همین صفحه نگه دار.');
          return;
        }
      }
      const fail = (message: string) => setError(revoked ? `دسترسی پروفایل قطع شد. ${message}` : message);
      if (profileDraft.conflict) { fail('ابتدا نسخهٔ تازه و پیش‌نویس را بررسی کن.'); return; }
      const validOptional = (value: number, min: number, max: number) => Number.isFinite(value) && (value === 0 || (value >= min && value <= max));
      if (!validOptional(draft.age, 13, 100)) { fail('سن را خالی بگذار یا بین ۱۳ تا ۱۰۰ وارد کن.'); return; }
      if (!validOptional(draft.heightCm, 100, 250)) { fail('قد را خالی بگذار یا بین ۱۰۰ تا ۲۵۰ سانتی‌متر وارد کن.'); return; }
      if (!validOptional(draft.weightKg, 30, 300)) { fail('وزن پروفایل را خالی بگذار یا بین ۳۰ تا ۳۰۰ کیلوگرم وارد کن.'); return; }
      if (!validOptional(draft.trainingDays, 1, 7) || !Number.isInteger(draft.trainingDays)) { fail('روزهای تمرین را خالی بگذار یا عددی بین ۱ تا ۷ وارد کن.'); return; }
      if (!validOptional(draft.sessionMinutes, 15, 240)) { fail('زمان جلسه را خالی بگذار یا بین ۱۵ تا ۲۴۰ دقیقه وارد کن.'); return; }
      if (!validOptional(draft.stressLevel, 1, 10)) { fail('استرس را خالی بگذار یا بین ۱ تا ۱۰ وارد کن.'); return; }
      const textFields = [draft.sex, draft.primaryGoal, draft.secondaryGoal, draft.trainingExperience, draft.dailyActivity, draft.sleepHours, draft.injuries, draft.equipment];
      if (textFields.some((value) => typeof value !== 'string' || value.length > 5000)) { fail('هر متن پروفایل باید حداکثر ۵۰۰۰ نویسه باشد.'); return; }
      if (!Array.isArray(draft.workingWeightReferences) || draft.workingWeightReferences.length > 100 || draft.workingWeightReferences.some((reference) =>
        !reference || typeof reference.label !== 'string' || !reference.label.trim() || reference.label.length > 200 ||
        !Number.isFinite(reference.weightKg) || reference.weightKg < 0 || reference.weightKg > 1000 || typeof reference.note !== 'string' || reference.note.length > 1000)) {
        fail('برای هر وزنه نام حرکت و عددی بین صفر تا ۱۰۰۰ کیلوگرم وارد کن؛ نام حداکثر ۲۰۰ و یادداشت حداکثر ۱۰۰۰ نویسه است.'); return;
      }
      const storedLocally = await saveProfile(draft, profileDraft.base);
      if (storedLocally === false) { fail('پروفایل در حافظهٔ دستگاه ذخیره نشد و ممکن است پس از بازکردن دوباره از دست برود.'); return; }
      if (hasCoach && user && shareWithCoach) {
        try {
          // The server requires the exact profile to be synced before it can be shared.
          let confirmed = false;
          for (let attempt = 0; attempt < 3 && !confirmed; attempt += 1) {
            try {
              const result = await api<{ stored: { shareWithCoach: boolean } }>('PUT', '/me/profile', { accountId: user.id, profile: draft, shareWithCoach: true, sharingVersion });
              if (result.stored?.shareWithCoach !== true) throw new Error('Sharing was not confirmed');
              confirmed = true;
            } catch (caught) {
              if (!(caught instanceof ApiError) || caught.status !== 409 || !caught.message.includes('همگام‌سازی پروفایل') || attempt === 2) throw caught;
              schedulePersonalSync();
              await new Promise((resolve) => window.setTimeout(resolve, 800));
            }
          }
          setServerSharing(true);
        } catch {
          setServerSharing(null);
          setSharingLoadError('وضعیت اشتراک در سرور تأیید نشد.');
          setError('پروفایل روی دستگاه ذخیره شد، اما نتیجهٔ اشتراک تأیید نشد. وضعیت دسترسی و تعارض‌های همگام‌سازی را بررسی و دوباره تلاش کن.');
          return;
        }
      }
      setError(''); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (caught) {
      const message = caught instanceof DraftChangedError ? caught.message : caught instanceof ApiError ? caught.message : 'ذخیرهٔ پروفایل انجام نشد.';
      setError(revoked ? `دسترسی پروفایل قطع شد. ${message}` : message);
    } finally { savingRef.current = false; setSaving(false); }
  };

  const revokeWhileStatusUnknown = async () => {
    if (!user || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const result = await api<{ shareWithCoach: boolean; sharingVersion: number }>('POST', '/me/profile/sharing', { accountId: user.id, shareWithCoach: false });
      if (result.shareWithCoach !== false || !Number.isSafeInteger(result.sharingVersion) || result.sharingVersion < 0) throw new Error('Revocation was not confirmed');
      setServerSharing(false); setSharingVersion(result.sharingVersion); setShareWithCoach(false); setSharingLoadError(''); setSharingLoaded(true);
      setError('اشتراک پروفایل قطع شد. تغییرات پیش‌نویس را جداگانه ذخیره کن.');
    } catch {
      setError('قطع اشتراک تأیید نشد؛ مربی ممکن است همچنان دسترسی داشته باشد و پیش‌نویس ذخیره نشده است.');
    } finally { savingRef.current = false; setSaving(false); }
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
        <form className="settings-form panel-card" aria-busy={saving} noValidate onSubmit={(event) => void submit(event)}>
          <fieldset className="editor-fieldset" disabled={saving} aria-label="ویرایش پروفایل">
          <div className="card-topline"><div><span className="eyebrow">پروفایل تمرینی</span><h2>دربارهٔ تو.</h2></div><UserRound size={18} className="icon-accent" /></div>
          <div className="settings-fields-grid">
            <label className="field-control"><span>سن</span><input type="number" min="13" max="100" value={draft.age === 0 ? '' : draft.age} onChange={(event) => update('age', Number(event.target.value))} /></label>
            <label className="field-control"><span>جنسیت</span><select value={draft.sex} onChange={(event) => update('sex', event.target.value)}><option value="">انتخاب کن</option><option value="مرد">مرد</option><option value="زن">زن</option><option value="ترجیح می‌دهم نگویم">ترجیح می‌دهم نگویم</option></select></label>
            <label className="field-control"><span>قد <small>سانتی‌متر</small></span><input type="number" min="100" max="250" value={draft.heightCm === 0 ? '' : draft.heightCm} onChange={(event) => update('heightCm', Number(event.target.value))} /></label>
            <label className="field-control"><span>وزن پروفایل <small>کیلوگرم</small></span><input type="number" min="30" max="300" step="0.1" value={draft.weightKg === 0 ? '' : draft.weightKg} onChange={(event) => update('weightKg', Number(event.target.value))} /></label>
            <label className="field-control"><span>هدف اصلی</span><input value={draft.primaryGoal} onChange={(event) => update('primaryGoal', event.target.value)} /></label>
            <label className="field-control"><span>هدف دوم</span><input value={draft.secondaryGoal} onChange={(event) => update('secondaryGoal', event.target.value)} /></label>
            <label className="field-control"><span>روزهای تمرین در هفته</span><input type="number" min="1" max="7" value={draft.trainingDays === 0 ? '' : draft.trainingDays} onChange={(event) => update('trainingDays', Number(event.target.value))} /></label>
            <label className="field-control"><span>حداکثر زمان جلسه <small>دقیقه</small></span><input type="number" min="15" max="240" value={draft.sessionMinutes === 0 ? '' : draft.sessionMinutes} onChange={(event) => update('sessionMinutes', Number(event.target.value))} /></label>
            <label className="field-control"><span>سابقهٔ تمرین</span><input value={draft.trainingExperience} onChange={(event) => update('trainingExperience', event.target.value)} /></label>
            <label className="field-control"><span>خواب</span><input value={draft.sleepHours} onChange={(event) => update('sleepHours', event.target.value)} /></label>
            <label className="field-control"><span>فعالیت روزانه</span><input value={draft.dailyActivity} onChange={(event) => update('dailyActivity', event.target.value)} /></label>
            <label className="field-control"><span>سطح استرس <small>۱ تا ۱۰</small></span><input type="number" min="1" max="10" value={draft.stressLevel === 0 ? '' : draft.stressLevel} onChange={(event) => update('stressLevel', Number(event.target.value))} /></label>
            <label className="field-control field-control--wide"><span>تجهیزات در دسترس</span><input value={draft.equipment} onChange={(event) => update('equipment', event.target.value)} /></label>
            <label className="field-control field-control--wide"><span>آسیب‌دیدگی یا محدودیت</span><textarea rows={3} value={draft.injuries} onChange={(event) => update('injuries', event.target.value)} /></label>
          </div>
          <section className="working-weights" aria-labelledby="working-weights-title">
            <div className="card-topline"><div><span className="eyebrow">اطلاعات شخصی تو</span><h3 id="working-weights-title">وزنه‌های کاری</h3></div></div>
            <p className="field-hint">اختیاری است؛ نام حرکت، وزنهٔ تقریبی و یادداشت خودت را وارد کن. این‌ها رکورد قطعی نیستند و ست‌های قبلی را تغییر نمی‌دهند.</p>
            {!referencesValid && <p className="form-error" role="alert">فهرست ذخیره‌شدهٔ وزنه‌ها ساختار قابل ویرایش ندارد؛ برای جلوگیری از حذف داده، آن را ذخیره نکن و با پشتیبانی تماس بگیر.</p>}
            {referencesValid && references.length === 0 && <p className="working-weights__empty">هنوز وزنه‌ای ثبت نکرده‌ای.</p>}
            {references.map((reference, index) => (
              <div className="working-weight-row" key={index}>
                <div className="working-weight-row__title"><strong>وزنهٔ {faNumber(index + 1)}</strong><button type="button" className="button button--ghost button--small" aria-label={`حذف وزنهٔ ${faNumber(index + 1)}`} onClick={() => update('workingWeightReferences', references.filter((_, position) => position !== index))}><Trash2 size={15} /> حذف</button></div>
                <div className="working-weight-row__fields">
                  <label className="field-control"><span>نام حرکت</span><input aria-label={`نام حرکت وزنهٔ ${faNumber(index + 1)}`} maxLength={200} value={reference.label} onChange={(event) => update('workingWeightReferences', references.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} /></label>
                  <label className="field-control"><span>وزنه <small>کیلوگرم</small></span><input aria-label={`مقدار وزنهٔ ${faNumber(index + 1)} به کیلوگرم`} type="number" min="0" max="1000" step="any" value={Number.isNaN(reference.weightKg) ? '' : reference.weightKg} onChange={(event) => update('workingWeightReferences', references.map((item, position) => position === index ? { ...item, weightKg: event.target.value === '' ? Number.NaN : Number(event.target.value) } : item))} /></label>
                  <label className="field-control field-control--wide"><span>یادداشت <small>اختیاری</small></span><input aria-label={`یادداشت وزنهٔ ${faNumber(index + 1)}`} maxLength={1000} value={reference.note} onChange={(event) => update('workingWeightReferences', references.map((item, position) => position === index ? { ...item, note: event.target.value } : item))} /></label>
                </div>
              </div>
            ))}
            <button type="button" className="button button--secondary button--small" disabled={!referencesValid || references.length >= 100} onClick={() => update('workingWeightReferences', [...references, { label: '', weightKg: Number.NaN, note: '' }])}><Plus size={15} /> افزودن وزنهٔ کاری</button>
            {references.length >= 100 && <p className="field-hint">حداکثر ۱۰۰ وزنه قابل ثبت است.</p>}
          </section>
          {hasCoach && (
            <label className="student-onboarding__consent settings-profile-consent">
              <input type="checkbox" checked={shareWithCoach} disabled={!sharingLoaded || Boolean(sharingLoadError)} onChange={(event) => { setSaved(false); setError(''); setShareWithCoach(event.target.checked); }} />
              <span><strong>نمایش پروفایل به مربی</strong><small>{sharingLoadError ? 'تا تأیید وضعیت، تغییرات ذخیره نمی‌شوند تا ناخواسته به مربی نرسند.' : sharingLoaded ? 'با روشن‌بودن و ذخیره، نسخهٔ تأییدشدهٔ پروفایل و وزنه‌ها پس از همگام‌سازی برای مربی فعلی دیده می‌شود. با خاموش‌کردن و ذخیره، ابتدا دسترسی پروفایل قطع می‌شود.' : 'در حال بارگذاری وضعیت اشتراک…'}</small></span>
            </label>
          )}
          {hasCoach && sharingLoadError && (
            <div className="settings-sync-retry" role="alert">
              <p className="form-error">{sharingLoadError}</p>
              <button type="button" className="button button--secondary button--small" onClick={() => setSharingReload((attempt) => attempt + 1)}>
                تلاش دوباره برای بارگذاری
              </button>
              <button type="button" className="button button--secondary button--small" onClick={() => void revokeWhileStatusUnknown()}>
                قطع اشتراک پروفایل در سرور
              </button>
            </div>
          )}
          {profileDraft.conflict && <DraftConflictNotice latest={profile} discard={profileDraft.discard} acceptCurrent={profileDraft.acceptCurrent} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="settings-save-row"><span className="field-hint">تغییرات، ست‌های ثبت‌شدهٔ قبلی را عوض نمی‌کنند.</span><button className="button button--primary" type="submit">{saving ? 'در حال ذخیره…' : saved ? <><Check size={16} /> ذخیره شد</> : <><Save size={16} /> ذخیرهٔ پروفایل</>}</button></div>
          </fieldset>
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


          <section className="panel-card privacy-card"><span className="privacy-icon"><LockKeyhole size={17} /></span><span className="eyebrow">حریم خصوصی</span><h3>داده‌های تو، انتخاب تو.</h3><p>{hasCoach ? 'پروفایل و وزنه‌های کاری فقط با فعال‌کردن اشتراک برای مربی دیده می‌شوند. خلاصهٔ تمرین و دفتر خوراک با اتصال به مربی در دسترس او هستند؛ برای قطع آن دسترسی، از بخش «همراهی مربی» در خانه اقدام کن. داده‌های همگام‌نشده با پاک‌کردن مرورگر از دست می‌روند.' : 'پروفایل و گزارش‌های شخصی به حساب همگام می‌شوند؛ داده‌های همگام‌نشده ممکن است با پاک‌کردن مرورگر از دست بروند.'}</p><div className="privacy-points">{hasCoach && <span><ShieldCheck size={14} /> اشتراک پروفایل با مربی قابل مدیریت است</span>}<span><ShieldCheck size={14} /> فایل پشتیبان را در جای امن نگه دار</span></div><button className="button button--secondary button--full" onClick={() => void exportBackup()}><Download size={16} /> دریافت نسخهٔ پشتیبان</button><small className="field-hint">JSON شامل پروفایل، هدف‌های تغذیه، جلسه‌ها، وزن و یادداشت‌های محلی است؛ برنامه، گفت‌وگو و دفتر خوراک سرور را ندارد. بازیابی خودکار در برنامه وجود ندارد.</small>{backupError && <p className="form-error" role="alert">{backupError}</p>}</section>
        </aside>
      </div>
      <div className="settings-disclaimer"><Info size={16} /><span>راهنمای تمرین عمومی و آموزشی است و جایگزین توصیهٔ پزشکی یا تشخیص فردی نیست. حرکت‌ها را متناسب با توانت تنظیم کن و برای درد یا پرسش سلامت از متخصص کمک بگیر.</span></div>
      <p className="settings-signature" data-web-revision={typeof __MEETY_WEB_REVISION__ === 'string' ? __MEETY_WEB_REVISION__ : 'نامشخص'}>
        طراحی شده توسط <bdi dir="ltr">mhdy</bdi>
      </p>
      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
