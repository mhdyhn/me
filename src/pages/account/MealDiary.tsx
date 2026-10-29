import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { MealsConflictPreview } from '../../components/NutritionConflictPreview';
import { DraftConflictNotice } from '../../components/DraftConflictNotice';
import { SessionDraftRecovery, SessionDraftStatus } from '../../components/SessionDraftNotice';
import { useSessionDraft } from '../../components/useSessionDraft';
import { ApiError, api } from '../../lib/api';
import { samePersonalValue } from '../../lib/draftGuard';
import { isDiaryResponse } from '../../lib/responseGuards';
import { isUncertainWrite } from '../../lib/writeOutcome';
import { getLocalDateKey } from '../../lib/format';
import { dayTotals, type Diary, type PlanMeal, type Targets } from '../../lib/nutrition';
import { MealsEditor, dayItems } from './MealsEditor';
import { TargetBars, TotalsStrip } from './NutritionParts';

type DiaryDraft = { day: string; meals: PlanMeal[] };

function isDiaryDraft(value: unknown): value is DiaryDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as DiaryDraft;
  return typeof draft.day === 'string' && Array.isArray(draft.meals)
    && draft.meals.every((meal) => meal && typeof meal.name === 'string' && Array.isArray(meal.items)
      && meal.items.every((item) => item && typeof item.foodId === 'string' && typeof item.grams === 'number'));
}

/** Everyone's own daily meal log; a recovery copy is limited to this account, day and tab. */
export function MealDiary({ targets, accountId }: { targets: Targets; accountId?: number | null }) {
  const today = getLocalDateKey();
  const [day, setDay] = useState(today);
  const [meals, setMeals] = useState<PlanMeal[] | null>(null);
  const [baseMeals, setBaseMeals] = useState<PlanMeal[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [needsLatest, setNeedsLatest] = useState(false);
  const [checkingLatest, setCheckingLatest] = useState(false);
  const [latestMeals, setLatestMeals] = useState<PlanMeal[] | null>(null);
  const diaryPath = `/me/diary/${day}${accountId != null ? `?accountId=${accountId}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setMeals(null); setLoadError(null);
    (async () => {
      try {
        const result = await api<{ diary: Diary }>('GET', diaryPath);
        if (cancelled) return;
        if (!isDiaryResponse(result.diary, day)) throw new ApiError(200, 'پاسخ دفتر خوراک نامعتبر است.');
        setMeals(result.diary.meals); setBaseMeals(result.diary.meals);
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'دفترچهٔ غذایی بارگذاری نشد.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [diaryPath, loadAttempt]);

  const dirty = meals !== null && !samePersonalValue(meals, baseMeals);
  const base = useMemo<DiaryDraft>(() => ({ day, meals: baseMeals }), [day, baseMeals]);
  const draft = useMemo<DiaryDraft>(() => ({ day, meals: meals ?? [] }), [day, meals]);
  const recovery = useSessionDraft(accountId != null ? `meety:session-draft:diary:${accountId}:${day}` : null,
    base, draft, dirty || needsLatest, !loading && !loadError && meals !== null, isDiaryDraft);
  const total = useMemo(() => (meals ? dayTotals({ name: day, meals }) : null), [meals, day]);

  async function changeDay(next: string) {
    if (savingRef.current || checkingLatest || !next || next === day) return;
    if (dirty || needsLatest) {
      const ok = await confirmModal({
        title: 'تغییرات ذخیره‌نشده',
        message: 'تغییرات این روز روی سرور ذخیره نشده‌اند. به روز دیگر بروید؟ نسخهٔ موقت فقط در همین زبانه می‌ماند، اگر مرورگر اجازه داده باشد.',
        confirmText: 'رفتن به روز دیگر', cancelText: 'انصراف و ماندن', variant: 'warning',
      });
      if (!ok) return;
    }
    setSaved(false); setSaveError(null); setNeedsLatest(false); setLatestMeals(null);
    setMeals(null); setLoadError(null); setLoading(true); setDay(next);
  }

  async function checkLatest(submitted?: PlanMeal[]) {
    setCheckingLatest(true);
    try {
      const result = await api<{ diary: Diary }>('GET', diaryPath);
      if (!isDiaryResponse(result.diary, day)) throw new ApiError(200, 'پاسخ دفتر خوراک نامعتبر است.');
      if (submitted && samePersonalValue(result.diary.meals, submitted)) {
        // A response can be lost after the server actually committed the same data.
        setMeals(result.diary.meals); setBaseMeals(result.diary.meals);
        setNeedsLatest(false); setLatestMeals(null); setSaveError(null); setSaved(true);
      } else {
        setLatestMeals(result.diary.meals); setSaveError(null);
      }
    } catch (caught) {
      setSaveError(caught instanceof ApiError ? caught.message : 'دریافت نسخهٔ تازه ممکن نشد. پیش‌نویس حفظ شده است.');
    } finally { setCheckingLatest(false); }
  }

  async function save() {
    if (!meals || savingRef.current || needsLatest) return;
    savingRef.current = true; setSaving(true); setSaveError(null);
    try {
      const result = await api<{ diary: Diary }>('PUT', '/me/diary', { day, meals, expectedMeals: baseMeals, ...(accountId != null ? { accountId } : {}) });
      if (!isDiaryResponse(result.diary, day)) throw new ApiError(200, 'پاسخ ذخیرهٔ دفتر خوراک نامعتبر است.');
      setMeals(result.diary.meals); setBaseMeals(result.diary.meals); setSaved(true);
    } catch (caught) {
      if (isUncertainWrite(caught)) {
        setNeedsLatest(true); setSaved(false);
        await checkLatest(meals);
      } else setSaveError(caught instanceof ApiError ? caught.message : 'پاسخ ذخیره دریافت نشد؛ پیش‌نویس را نگه دار و دوباره بررسی کن.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  const invalidRecovery = recovery.recovery.kind === 'invalid' || (recovery.recovery.kind === 'recovery'
    && (recovery.recovery.record.base.day !== day || recovery.recovery.record.draft.day !== day));

  return (
    <section className="panel-card meal-diary" aria-label="ثبت وعده‌های روزانه">
      <fieldset className="editor-fieldset" disabled={saving || checkingLatest} aria-busy={saving || checkingLatest} aria-label="ویرایش دفتر خوراک"><div className="editor-fieldset__content meal-diary__content">
      <div className="card-topline">
        <div><span className="eyebrow">ثبت وعده‌های روزانه</span><h2>آنچه خوردی.</h2></div>
        <div className="meal-diary__day">
          <input type="date" value={day} max={today} onChange={(event) => void changeDay(event.target.value)} aria-label="روز" />
          {day !== today && <button type="button" className="button button--ghost" onClick={() => void changeDay(today)}><RotateCcw size={14} /> امروز</button>}
        </div>
      </div>

      {loadError && <div className="account-load-error" role="alert">
        <p>{loadError}</p>
        <button type="button" className="button button--secondary button--small" disabled={loading} onClick={() => setLoadAttempt((attempt) => attempt + 1)}>تلاش دوباره برای بارگذاری این روز</button>
      </div>}
      {loading && <p className="account-muted" role="status">در حال بارگذاری…</p>}

      {!loading && !loadError && recovery.pending && (recovery.recovery.kind === 'empty'
        ? <p className="account-muted">در حال بررسی پیش‌نویس…</p>
        : <SessionDraftRecovery invalid={invalidRecovery} onRestore={() => {
          const record = recovery.restore();
          if (!record) return;
          const latest = baseMeals;
          setMeals(record.draft.meals); setBaseMeals(record.base.meals); setSaved(false);
          if (!samePersonalValue(record.base.meals, latest)) { setLatestMeals(latest); setNeedsLatest(true); }
        }} onDiscard={recovery.discard} />)}

      {!recovery.pending && meals && total && <>
        <SessionDraftStatus dirty={dirty || needsLatest} storage={recovery.storage} />
        {needsLatest && latestMeals && <DraftConflictNotice latest={latestMeals} preview={<MealsConflictPreview meals={latestMeals} />}
          discard={() => { setMeals(latestMeals); setBaseMeals(latestMeals); setLatestMeals(null); setNeedsLatest(false); setSaved(false); }}
          acceptCurrent={() => { setBaseMeals(latestMeals); setLatestMeals(null); setNeedsLatest(false); setSaved(false); }} />}
        {needsLatest && !latestMeals && <div className="account-load-error" role="alert">
          <p>وضعیت ذخیره یا نسخهٔ تازه روشن نیست؛ پیش‌نویس شما حفظ شده است.</p>
          <button type="button" className="button button--secondary button--small" onClick={() => void checkLatest()}>دریافت نسخهٔ تازه</button>
        </div>}
        <TotalsStrip totals={total} items={dayItems(meals)} />
        <TargetBars totals={total} targets={targets} />
        <MealsEditor key={day} meals={meals} onChange={(next) => { setMeals(next); setSaved(false); }} />
        <div className="nutrition-save-bar">
          <span className="account-muted" role="status">{saving || checkingLatest ? 'در حال بررسی و ذخیره…' : saved ? 'ثبت این روز ذخیره شد.' : dirty ? 'تغییرات ذخیره‌نشده دارید.' : ' '}</span>
          <button type="button" className="button button--primary" disabled={saving || checkingLatest || !dirty || needsLatest} onClick={() => void save()}><Save size={16} /> ذخیرهٔ این روز</button>
        </div>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
      </>}
      </div></fieldset>
    </section>
  );
}
